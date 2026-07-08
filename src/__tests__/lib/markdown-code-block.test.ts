// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CodeBlock from "@/lib/markdown/components/code-block";

describe("CodeBlock", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("normalizes language aliases and copies raw code", async () => {
    render(
      React.createElement(
        CodeBlock,
        { language: "js", rawContent: "const answer = 42\n" },
        React.createElement("code", { className: "hljs language-js" }, [
          React.createElement("span", { className: "hljs-keyword", key: "kw" }, "const"),
          " answer = 42\n",
        ]),
      ),
    );

    expect(screen.getByText("JavaScript")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "const answer = 42\n",
      ),
    );
    expect(screen.getByText("Copied")).toBeTruthy();
  });

  it("falls back to CODE for unknown languages without exposing word-wrap chrome", () => {
    const { container } = render(
      React.createElement(
        CodeBlock,
        { language: "mysterylang", rawContent: "aaaaaaaa" },
        React.createElement("code", null, "aaaaaaaa"),
      ),
    );

    expect(screen.getByText("CODE")).toBeTruthy();
    expect(screen.queryByText("Wrap")).toBeNull();
    expect(screen.queryByRole("button", { name: /line wrap/i })).toBeNull();
    expect(container.querySelector("pre")?.className).not.toContain(
      "whitespace-pre-wrap",
    );
  });
});
