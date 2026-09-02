import { describe, expect, it } from "vitest";
import { isChatComposerReady } from "@/components/chat/chat-interface";

describe("isChatComposerReady", () => {
  it("allows a new conversation to send immediately", () => {
    expect(isChatComposerReady(undefined, true, false)).toBe(true);
  });

  it("blocks an existing conversation until its route session is restored", () => {
    expect(isChatComposerReady("session-1", false, false)).toBe(false);
  });

  it("allows an existing conversation after restore", () => {
    expect(isChatComposerReady("session-1", true, false)).toBe(true);
  });

  it("blocks the composer while generation is busy", () => {
    expect(isChatComposerReady(undefined, true, true)).toBe(false);
  });
});
