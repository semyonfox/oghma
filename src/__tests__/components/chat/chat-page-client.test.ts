import { describe, expect, it } from "vitest";
import { shouldApplyPendingChatNavigation } from "@/app/chat/chat-page-client";

describe("pending chat navigation", () => {
  const pending = {
    sessionId: "created-session",
    href: "/chat/created-session",
    originRouteSessionId: null,
  };

  it("applies completion for the session created from the current route", () => {
    expect(
      shouldApplyPendingChatNavigation(pending, "created-session", null),
    ).toBe(true);
  });

  it("does not let stale completion leave the current route", () => {
    expect(
      shouldApplyPendingChatNavigation(
        pending,
        "created-session",
        "selected-session",
      ),
    ).toBe(false);
  });

  it("ignores completion from another operation", () => {
    expect(shouldApplyPendingChatNavigation(pending, "older-session", null)).toBe(
      false,
    );
  });
});
