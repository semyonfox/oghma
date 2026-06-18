import { describe, expect, it } from "vitest";
import { normalizeMessageParts } from "@/lib/chat/types";

describe("normalizeMessageParts", () => {
  it("accepts a well-formed parts array", () => {
    const input = [
      { type: "text", text: "hi" },
      { type: "tool", name: "getChunks", label: "Searching notes" },
      { type: "error", text: "Interrupted" },
    ];
    expect(normalizeMessageParts(input)).toEqual(input);
  });

  it("drops malformed entries without throwing", () => {
    const input = [
      { type: "text", text: "ok" },
      { type: "tool", name: "x" }, // missing label
      null,
      { type: "unknown", text: "skip" },
      { type: "text", text: 42 }, // wrong text type
      { type: "tool", name: "y", label: "Doing y" },
      { type: "error", text: "keep" },
    ];
    expect(normalizeMessageParts(input)).toEqual([
      { type: "text", text: "ok" },
      { type: "tool", name: "y", label: "Doing y" },
      { type: "error", text: "keep" },
    ]);
  });

  it("returns null for non-array input", () => {
    expect(normalizeMessageParts(null)).toBeNull();
    expect(normalizeMessageParts(undefined)).toBeNull();
    expect(normalizeMessageParts("string")).toBeNull();
    expect(normalizeMessageParts({})).toBeNull();
  });

  it("returns an empty array for an empty input array", () => {
    expect(normalizeMessageParts([])).toEqual([]);
  });
});
