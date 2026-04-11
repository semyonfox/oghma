// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CompactMessageBubble,
  FullMessageBubble,
} from "@/components/chat/message-bubble";
import type { Message } from "@/components/chat/chat-interface";

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

  beforeEach(() => {
    document.body.innerHTML = "";
    writeText.mockClear();
    Object.assign(navigator, {
      clipboard: {
        writeText,
      },
    });
  });

  function renderNode(node: React.ReactNode) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
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
});
