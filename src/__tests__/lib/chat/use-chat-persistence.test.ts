// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatPersistence } from "@/lib/chat/hooks/use-chat-persistence";

function generatingSnapshot(): Response {
  return new Response(
    JSON.stringify({
      session: {
        generation_status: "generating",
        active_generation_id: "gen-1",
      },
      messages: [{ id: "m1", role: "user", content: "hi" }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("useChatPersistence background polling", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => Promise.resolve(generatingSnapshot()));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("stops refetching the session once a live stream claims the generation", async () => {
    const { result } = renderHook(() =>
      useChatPersistence({ compact: false, controlledSessionId: "session-1" }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.backgroundGenerationId).toBe("gen-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // unclaimed, the hook keeps polling the durable session
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    act(() => result.current.claimBackgroundGeneration("gen-1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
