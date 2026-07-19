import { describe, expect, it } from "vitest";
import {
  groupMessageParts,
  normalizeMessageParts,
  partitionMessageParts,
} from "@/lib/chat/types";

describe("normalizeMessageParts", () => {
  it("accepts a well-formed parts array", () => {
    const input = [
      { type: "text", text: "hi" },
      {
        type: "tool",
        name: "getChunks",
        label: "Searching notes",
        callId: "call-1",
        detail: "“syntax”",
      },
      { type: "error", text: "Interrupted" },
    ];
    expect(normalizeMessageParts(input)).toEqual(input);
  });

  it("preserves safe tool display details across persistence reloads", () => {
    expect(
      normalizeMessageParts([
        {
          type: "tool",
          name: "readNote",
          label: "Reading note",
          callId: "call-2",
          detail: "Complete Syntax",
        },
      ]),
    ).toEqual([
      {
        type: "tool",
        name: "readNote",
        label: "Reading note",
        callId: "call-2",
        detail: "Complete Syntax",
      },
    ]);
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

describe("groupMessageParts", () => {
  it("groups adjacent tool calls while preserving surrounding part order", () => {
    expect(
      groupMessageParts([
        { type: "text", text: "Checking. " },
        { type: "tool", name: "getChunks", label: "Searching notes" },
        { type: "tool", name: "readNote", label: "Reading note" },
        { type: "text", text: "Found it." },
        { type: "error", text: "Interrupted" },
      ]),
    ).toEqual([
      { type: "text", text: "Checking. " },
      {
        type: "tool-group",
        tools: [
          { name: "getChunks", label: "Searching notes" },
          { name: "readNote", label: "Reading note" },
        ],
      },
      { type: "text", text: "Found it." },
      { type: "error", text: "Interrupted" },
    ]);
  });

  it("keeps tool calls separated when text appears between them", () => {
    expect(
      groupMessageParts([
        { type: "tool", name: "first", label: "First action" },
        { type: "text", text: "Then " },
        { type: "tool", name: "second", label: "Second action" },
      ]),
    ).toEqual([
      { type: "tool-group", tools: [{ name: "first", label: "First action" }] },
      { type: "text", text: "Then " },
      {
        type: "tool-group",
        tools: [{ name: "second", label: "Second action" }],
      },
    ]);
  });
});

describe("partitionMessageParts", () => {
  it("keeps text-only messages entirely in the answer", () => {
    expect(
      partitionMessageParts([{ type: "text", text: "Final answer" }]),
    ).toEqual({
      activity: [],
      answer: [{ type: "text", text: "Final answer" }],
      answerText: "Final answer",
      toolCount: 0,
    });
  });

  it("moves interleaved narration into activity and keeps trailing prose as the answer", () => {
    const parts = [
      { type: "tool" as const, name: "search", label: "Searching notes" },
      { type: "text" as const, text: "Let me open that note." },
      { type: "tool" as const, name: "read", label: "Reading note" },
      { type: "text" as const, text: "Here is the final answer." },
    ];
    const result = partitionMessageParts(parts);

    expect(result.activity).toEqual(parts.slice(0, 3));
    expect(result.answer).toEqual(parts.slice(3));
    expect(result.answerText).toBe("Here is the final answer.");
    expect(result.toolCount).toBe(2);
  });

  it("returns a process-only state when a message ends with a tool", () => {
    const result = partitionMessageParts([
      { type: "text", text: "Checking" },
      { type: "tool", name: "read", label: "Reading note" },
    ]);
    expect(result.activity).toHaveLength(2);
    expect(result.answer).toEqual([]);
    expect(result.answerText).toBe("");
  });

  it("merges consecutive trailing text for answer actions", () => {
    expect(
      partitionMessageParts([
        { type: "tool", name: "read", label: "Reading note" },
        { type: "text", text: "Final " },
        { type: "text", text: "answer" },
      ]).answerText,
    ).toBe("Final answer");
  });
});
