// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  markCanvasNew: vi.fn(),
  refreshTreePaths: vi.fn().mockResolvedValue(undefined),
  refreshTree: vi.fn(),
}));

vi.mock("@/lib/notes/state/sync-status", () => ({
  default: {
    getState: () => ({ markCanvasNew: mocks.markCanvasNew }),
  },
}));

vi.mock("@/lib/notes/state/tree", () => ({
  default: {
    getState: () => ({
      refreshTreePaths: mocks.refreshTreePaths,
      refreshTree: mocks.refreshTree,
    }),
  },
}));

import { useCanvasImportStatus } from "@/hooks/useCanvasImportStatus";

function canvasStatus(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    activeJob: {
      jobId: "job-1",
      status: "processing",
      jobType: "import",
    },
    latestJob: {
      jobId: "job-1",
      status: "processing",
      jobType: "import",
    },
    progress: { total: 2, completed: 0, percent: 0 },
    issues: { forbidden: 0, error: 0 },
    recentLogs: [],
    ...overrides,
  };
}

describe("useCanvasImportStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("surfaces a failed parent job even when no files were discovered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          canvasStatus({
            activeJob: null,
            latestJob: { jobId: "job-1", status: "failed", jobType: "import" },
            progress: { total: 0, completed: 0, percent: 0 },
          }),
      }),
    );
    const { result } = renderHook(() =>
      useCanvasImportStatus({ autoCheckOnMount: false }),
    );
    await act(async () => {
      await result.current.checkStatus();
    });
    expect(result.current.isImporting).toBe(false);
    expect(result.current.showToast).toBe(true);
    expect(result.current.progress?.failed).toBe(true);
    act(() => result.current.onToastClose());
    await act(async () => {
      await result.current.checkStatus();
    });
    expect(result.current.showToast).toBe(false);
  });

  it("clears failed progress when automatic sync queues a replacement job", async () => {
    let finishSync: (value: {
      queued: boolean;
      jobId: string;
    }) => void = () => {
      throw new Error("Sync response is not waiting");
    };
    const syncResponse = new Promise<{ queued: boolean; jobId: string }>(
      (resolve) => {
        finishSync = resolve;
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/canvas/status") {
          return {
            ok: true,
            json: async () =>
              canvasStatus({
                activeJob: null,
                latestJob: {
                  jobId: "failed-job",
                  status: "failed",
                  jobType: "import",
                },
              }),
          };
        }
        return {
          ok: true,
          json: async () =>
            init?.method === "POST" ? syncResponse : { available: true },
        };
      }),
    );
    const { result } = renderHook(() => useCanvasImportStatus());
    await waitFor(() => expect(result.current.progress?.failed).toBe(true));
    await act(async () => {
      finishSync({ queued: true, jobId: "replacement-job" });
    });
    await waitFor(() => expect(result.current.isImporting).toBe(true));
    expect(result.current.progress).toBeNull();
    expect(result.current.showToast).toBe(true);
  });

  it("recovers from a stale local job record before checking the current status", async () => {
    localStorage.setItem("canvas_active_job", "not-json");
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/canvas/status") {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, activeJob: null }),
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ available: false }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useCanvasImportStatus());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/canvas/status",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(localStorage.getItem("canvas_active_job")).toBeNull();
  });

  it("waits for the initial status check before starting automatic sync", async () => {
    let resolveStatus: ((response: object) => void) | undefined;
    const statusResponse = new Promise<object>((resolve) => {
      resolveStatus = resolve;
    });
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/canvas/status") return statusResponse;
      if (url === "/api/canvas/sync") {
        return Promise.resolve({
          json: async () => ({ available: true, activeJob: null }),
        });
      }
      return Promise.resolve({
        json: async () => ({ queued: false, reason: "recent" }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = renderHook(() => useCanvasImportStatus());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/canvas/status",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveStatus?.({
      ok: true,
      json: async () => ({ success: true, activeJob: null, latestJob: null }),
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/canvas/sync?automatic=true",
        { method: "POST" },
      );
    });
    unmount();
  });

  it("batches published branches without resetting the full tree", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        canvasStatus({
          recentLogs: [
            {
              noteId: "note-1",
              status: "indexing",
              treePath: ["course-1", "note-1"],
            },
            {
              noteId: "note-2",
              status: "indexing",
              treePath: ["course-1", "note-2"],
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() =>
      useCanvasImportStatus({ autoCheckOnMount: false }),
    );

    await act(async () => {
      await result.current.checkStatus();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });

    expect(mocks.markCanvasNew).toHaveBeenCalledWith(["note-1", "note-2"]);
    expect(mocks.refreshTreePaths).toHaveBeenCalledWith([
      ["course-1", "note-1"],
      ["course-1", "note-2"],
    ]);
    expect(mocks.refreshTree).not.toHaveBeenCalled();
    unmount();
  });

  it("does not refresh the root for logs without a published tree path", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          canvasStatus({
            recentLogs: [{ noteId: "note-1", status: "indexing" }],
          }),
      }),
    );
    const { result, unmount } = renderHook(() =>
      useCanvasImportStatus({ autoCheckOnMount: false }),
    );

    await act(async () => {
      await result.current.checkStatus();
      await vi.advanceTimersByTimeAsync(750);
    });

    expect(mocks.markCanvasNew).toHaveBeenCalledWith(["note-1"]);
    expect(mocks.refreshTreePaths).not.toHaveBeenCalled();
    unmount();
  });

  it("acknowledges a completed job only after every branch refreshes", async () => {
    localStorage.setItem(
      "canvas_active_job",
      JSON.stringify({ jobId: "job-1" }),
    );
    let finishTreeRefresh: (() => void) | undefined;
    mocks.refreshTreePaths.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishTreeRefresh = resolve;
      }),
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        canvasStatus({
          activeJob: null,
          latestJob: {
            jobId: "job-1",
            status: "complete",
            jobType: "import",
          },
          progress: { total: 60, completed: 60, percent: 100 },
          recentLogs: [
            {
              noteId: "note-60",
              status: "complete",
              treePath: ["course-1", "note-60"],
            },
          ],
          publishedTreePaths: [
            ["course-1", "note-1"],
            ["course-1", "note-60"],
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() =>
      useCanvasImportStatus({ autoCheckOnMount: false }),
    );

    let statusPromise: Promise<void> | undefined;
    act(() => {
      statusPromise = result.current.checkStatus();
    });
    await waitFor(() => {
      expect(mocks.refreshTreePaths).toHaveBeenCalled();
    });

    const [refreshedPaths] = mocks.refreshTreePaths.mock.calls[0];
    expect(refreshedPaths).toHaveLength(2);
    expect(refreshedPaths).toEqual(
      expect.arrayContaining([
        ["course-1", "note-1"],
        ["course-1", "note-60"],
      ]),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/canvas/status?publishJobId=job-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(localStorage.getItem("canvas_active_job")).not.toBeNull();

    finishTreeRefresh?.();
    await act(async () => {
      await statusPromise;
    });
    expect(localStorage.getItem("canvas_active_job")).toBeNull();

    await act(async () => {
      await result.current.checkStatus();
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/canvas/status",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    unmount();
  });

  it("runs the terminal refresh after an older branch refresh finishes", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      "canvas_active_job",
      JSON.stringify({ jobId: "job-1" }),
    );
    let finishOlderRefresh: (() => void) | undefined;
    mocks.refreshTreePaths
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishOlderRefresh = resolve;
        }),
      )
      .mockResolvedValueOnce(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          canvasStatus({
            recentLogs: [
              {
                noteId: "note-1",
                status: "indexing",
                treePath: ["course-1", "note-1"],
              },
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          canvasStatus({
            activeJob: null,
            latestJob: {
              jobId: "job-1",
              status: "complete",
              jobType: "import",
            },
            progress: { total: 2, completed: 2, percent: 100 },
            recentLogs: [],
            publishedTreePaths: [
              ["course-1", "note-1"],
              ["course-1", "note-2"],
            ],
          }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() =>
      useCanvasImportStatus({ autoCheckOnMount: false }),
    );

    await act(async () => {
      await result.current.checkStatus();
      await vi.advanceTimersByTimeAsync(750);
    });
    expect(mocks.refreshTreePaths).toHaveBeenCalledTimes(1);

    let terminalStatus: Promise<void> | undefined;
    act(() => {
      terminalStatus = result.current.checkStatus();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.refreshTreePaths).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("canvas_active_job")).not.toBeNull();

    finishOlderRefresh?.();
    await act(async () => {
      await terminalStatus;
    });

    expect(mocks.refreshTreePaths).toHaveBeenCalledTimes(2);
    expect(mocks.refreshTreePaths).toHaveBeenLastCalledWith([
      ["course-1", "note-1"],
      ["course-1", "note-2"],
    ]);
    expect(localStorage.getItem("canvas_active_job")).toBeNull();
    unmount();
  });

  it("continues polling during discovery", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        canvasStatus({
          activeJob: {
            jobId: "job-1",
            status: "discovering",
            jobType: "import",
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() =>
      useCanvasImportStatus({ autoCheckOnMount: false }),
    );

    await act(async () => {
      await result.current.checkStatus();
    });
    expect(result.current.isImporting).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unmount();
  });
});
