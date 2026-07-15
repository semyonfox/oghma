// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Root } from "react-dom/client";
import {
  CompactMessageBubble,
  FullMessageBubble,
} from "@/components/chat/message-bubble";
import type { Message } from "@/components/chat/chat-interface";

const markdownRender = vi.hoisted(() => vi.fn());

vi.mock("@/components/chat/chat-markdown", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/chat/chat-markdown")
  >("@/components/chat/chat-markdown");

  return {
    default: ({ children }: { children: string }) => {
      markdownRender(children);
      return React.createElement(actual.default, undefined, children);
    },
  };
});

function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: "message-1",
    role: "assistant",
    content: "copiable text",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("message bubble copy actions", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const roots: Root[] = [];

  beforeEach(() => {
    document.body.innerHTML = "";
    writeText.mockClear();
    markdownRender.mockClear();
    Object.assign(navigator, {
      clipboard: {
        writeText,
      },
    });
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
  });

  function renderNode(node: React.ReactNode) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => {
      root.render(node);
    });
    return container;
  }

  it("copies only the main message text from full bubbles", async () => {
    const container = renderNode(
      React.createElement(
        "div",
        undefined,
        React.createElement(FullMessageBubble, {
          message: makeMessage({ role: "user", content: "user text" }),
        }),
        React.createElement(FullMessageBubble, {
          message: makeMessage({
            id: "message-2",
            role: "assistant",
            content: "assistant text",
            thinking: "internal chain",
            sources: [{ id: "note-1", title: "Source note" }],
          }),
        }),
      ),
    );

    const copyButtons = Array.from(
      container.querySelectorAll("button[aria-label='Copy message']"),
    );
    expect(copyButtons).toHaveLength(2);

    copyButtons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("user text"));

    copyButtons[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith("assistant text"),
    );
  });

  it("copies only the main message text from compact bubbles", async () => {
    const container = renderNode(
      React.createElement(
        "div",
        undefined,
        React.createElement(CompactMessageBubble, {
          message: makeMessage({ role: "user", content: "compact user text" }),
        }),
        React.createElement(CompactMessageBubble, {
          message: makeMessage({
            id: "message-3",
            role: "assistant",
            content: "compact assistant text",
            thinking: "hidden thinking",
            sources: [{ id: "note-2", title: "Another source" }],
          }),
        }),
      ),
    );

    const copyButtons = Array.from(
      container.querySelectorAll("button[aria-label='Copy message']"),
    );
    expect(copyButtons).toHaveLength(2);

    copyButtons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("compact user text"),
    );

    copyButtons[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith("compact assistant text"),
    );
  });

  it("renders user markdown, display math, and fenced code in both bubble sizes", () => {
    const content = "**Formatted**\n\n$$x^2$$\n\n```js\nconst x = 2\n```";
    const container = renderNode(
      React.createElement(
        "div",
        undefined,
        React.createElement(FullMessageBubble, {
          message: makeMessage({ role: "user", content }),
        }),
        React.createElement(CompactMessageBubble, {
          message: makeMessage({ role: "user", content }),
        }),
      ),
    );

    const userMarkdown = container.querySelectorAll(
      '[data-markdown-variant="chat"]',
    );
    expect(userMarkdown).toHaveLength(2);

    for (const rendered of userMarkdown) {
      expect(rendered.querySelector("strong")?.textContent).toBe("Formatted");
      expect(rendered.querySelector(".katex")).not.toBeNull();
      expect(rendered.querySelector(".oghma-codeblock")).not.toBeNull();
      expect(rendered.querySelector("code.language-js")?.textContent).toContain(
        "const x = 2",
      );
    }
  });

  it("does not re-render historical Markdown when a streaming message changes", () => {
    const historical = makeMessage({
      id: "historical",
      content: "**finished response**",
    });
    const streaming = makeMessage({
      id: "streaming",
      content: "partial",
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        React.createElement(
          React.Fragment,
          undefined,
          React.createElement(FullMessageBubble, { message: historical }),
          React.createElement(FullMessageBubble, { message: streaming }),
        ),
      );
    });

    const updatedStreaming = { ...streaming, content: "partial response" };
    act(() => {
      root.render(
        React.createElement(
          React.Fragment,
          undefined,
          React.createElement(FullMessageBubble, { message: historical }),
          React.createElement(FullMessageBubble, {
            message: updatedStreaming,
          }),
        ),
      );
    });

    expect(markdownRender.mock.calls).toEqual([
      ["**finished response**"],
      ["partial"],
      ["partial response"],
    ]);
  });
});
