// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePollingJob } from "@/lib/hooks/use-polling-job";

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve: resolve! };
}

describe("usePollingJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("passes decoded job data to the typed callback and stops at a terminal state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ job: { status: "complete" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onData = vi.fn(
      (data: { job?: { status?: string } }) => data.job?.status === "complete",
    );

    renderHook(() =>
      usePollingJob({
        url: "/api/jobs/1",
        interval: 100,
        enabled: true,
        onData,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(onData).toHaveBeenCalledWith({ job: { status: "complete" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips interval ticks while a previous poll is still in flight", async () => {
    const firstResponse = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstResponse.promise)
      .mockResolvedValue(
        new Response(JSON.stringify({ job: { status: "processing" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      usePollingJob({
        url: "/api/jobs/1",
        interval: 100,
        enabled: true,
        onData: () => false,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstResponse.resolve(
        new Response(JSON.stringify({ job: { status: "processing" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts the active poll when the hook unmounts", async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      }),
    );

    const { unmount } = renderHook(() =>
      usePollingJob({
        url: "/api/jobs/1",
        interval: 100,
        enabled: true,
        onData: () => false,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(requestSignal?.aborted).toBe(false);
    unmount();
    expect(requestSignal?.aborted).toBe(true);
  });

  it("reports malformed responses without passing them to consumers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ progress: { completed: "all" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const onData = vi.fn(() => false);
    const onError = vi.fn();

    renderHook(() =>
      usePollingJob({
        url: "/api/jobs/1",
        interval: 100,
        enabled: true,
        onData,
        onError,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(onData).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid polling job response" }),
    );
  });
});
