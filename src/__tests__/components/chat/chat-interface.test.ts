import { describe, expect, it } from "vitest";
import { shouldPreserveLiveSession } from "@/components/chat/chat-interface";

describe("shouldPreserveLiveSession", () => {
  it("preserves optimistic messages when a new session ID is reflected by the parent", () => {
    expect(shouldPreserveLiveSession("session-1", "session-1", 2)).toBe(true);
  });

  it("allows restoration for a newly mounted existing session", () => {
    expect(shouldPreserveLiveSession("session-1", null, 0)).toBe(false);
  });

  it("allows restoration when switching to a different session", () => {
    expect(shouldPreserveLiveSession("session-2", "session-1", 2)).toBe(false);
  });
});
