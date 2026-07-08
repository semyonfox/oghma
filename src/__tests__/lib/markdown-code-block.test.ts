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

  it("falls back to CODE for unknown languages and toggles wrapping quietly", () => {
    const { container } = render(
      React.createElement(
        CodeBlock,
        { language: "mysterylang", rawContent: "aaaaaaaa" },
        React.createElement("code", null, "aaaaaaaa"),
      ),
    );

    expect(screen.getByText("CODE")).toBeTruthy();
    expect(screen.queryByText("Wrap")).toBeNull();

    const wrapButton = screen.getByRole("button", { name: "Enable line wrap" });
    const pre = container.querySelector("pre");
    expect(pre?.className).not.toContain("whitespace-pre-wrap");

    fireEvent.click(wrapButton);

    expect(screen.getByRole("button", { name: "Disable line wrap" })).toBeTruthy();
    expect(pre?.className).toContain("whitespace-pre-wrap");
  });
});
