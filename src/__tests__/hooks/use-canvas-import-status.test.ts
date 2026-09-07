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
