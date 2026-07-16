import { describe, expect, it } from "vitest";
import { toolCallDetail, toolResultDetail } from "@/lib/chat/tool-display";

describe("tool activity display details", () => {
  it("shows the search query without exposing result content", () => {
    expect(toolCallDetail("getChunks", { query: "invalid HTML syntax", mode: "both" }))
      .toBe("“invalid HTML syntax”");
  });

  it("uses the returned title for a completed note read", () => {
    expect(toolResultDetail("readNote", {
      noteId: "154b1133-54df-4e0e-a154-9b637750f106",
      title: "Complete Syntax",
      content: "private note content",
    })).toBe("Complete Syntax");
  });

  it("does not put arbitrary tool inputs or note content in the activity UI", () => {
    expect(toolCallDetail("makeMDNote", { content: "private note content" })).toBeUndefined();
    expect(toolResultDetail("readNote", { content: "private note content" })).toBeUndefined();
  });
});
