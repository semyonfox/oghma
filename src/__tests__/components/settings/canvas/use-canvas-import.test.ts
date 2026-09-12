// @vitest-environment jsdom

import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storeMocks = vi.hoisted(() => ({
  refreshTreePaths: vi.fn().mockResolvedValue(undefined),
  fetchNote: vi.fn().mockResolvedValue(undefined),
}));
const layoutState = vi.hoisted(() => ({
  paneA: null as { fileId: string; fileType: "note" } | null,
  paneB: null as { fileId: string; fileType: "note" } | null,
}));

vi.mock("@/lib/notes/state/tree", () => ({
  default: {
    getState: () => ({ refreshTreePaths: storeMocks.refreshTreePaths }),
  },
}));
vi.mock("@/lib/notes/state/note", () => ({
  default: { getState: () => ({ fetchNote: storeMocks.fetchNote }) },
}));
vi.mock("@/lib/notes/state/layout.zustand", () => ({
  default: { getState: () => layoutState },
}));

import useCanvasImport from "@/components/settings/canvas/use-canvas-import";

function statusResponse(forbiddenCourseId: string) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      activeJob: { phase: "processing" },
      progress: null,
      recentLogs: [{ status: "forbidden", courseId: forbiddenCourseId }],
    }),
  };
}

describe("useCanvasImport polling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    layoutState.paneA = null;
    layoutState.paneB = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("acknowledges a completed import only after every path refreshes", async () => {
    layoutState.paneA = { fileId: "note-1", fileType: "note" };
    localStorage.setItem(
      "canvas_active_job",
      JSON.stringify({ jobId: "job-1" }),
    );
    let finishTreeRefresh: (() => void) | undefined;
    storeMocks.refreshTreePaths.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishTreeRefresh = resolve;
      }),
    );
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          activeJob: null,
          latestJob: { jobId: "job-1", status: "complete" },
          progress: { percent: 100, completed: 60, total: 60 },
          recentLogs: [
            { status: "complete", treePath: ["course-1", "note-60"] },
          ],
          publishedJobId: "job-1",
          publishedTreePaths: [
            ["course-1", "note-1"],
            ["course-1", "note-60"],
          ],
          issues: { forbidden: 0, error: 0 },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => {
      const [courseErrors, setCourseErrors] = React.useState<
        Record<string, string>
      >({});
      const [forbiddenCourses, setForbiddenCourses] = React.useState<
        Record<string, boolean>
      >({});
      const [syncedCourses, setSyncedCourses] = React.useState<
        Record<string, boolean>
      >({});
      const [, setConnectionError] = React.useState<string | null>(null);

      return useCanvasImport({
        selectedCourseIds: [],
        courses: [],
        courseErrors,
        setCourseErrors,
        forbiddenCourses,
        setForbiddenCourses,
        syncedCourses,
        setSyncedCourses,
        setConnectionError,
        t: (key) => key,
      });
    });

    act(() => result.current.startPolling("job-1"));

    await waitFor(() => {
      expect(storeMocks.refreshTreePaths).toHaveBeenCalledWith([
        ["course-1", "note-1"],
        ["course-1", "note-60"],
      ]);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/canvas/status?publishJobId=job-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(localStorage.getItem("canvas_active_job")).not.toBeNull();
    expect(storeMocks.fetchNote).not.toHaveBeenCalled();

    finishTreeRefresh?.();
    await waitFor(() => {
      expect(localStorage.getItem("canvas_active_job")).toBeNull();
    });
    expect(storeMocks.fetchNote).toHaveBeenCalledWith("note-1");
    unmount();
  });

  it("publishes partial results from a failed import before acknowledging it", async () => {
    localStorage.setItem(
      "canvas_active_job",
      JSON.stringify({ jobId: "job-1" }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          activeJob: null,
          latestJob: {
            jobId: "job-1",
            status: "failed",
            errorMessage: "One file could not be imported",
          },
          progress: { percent: 99, completed: 1, total: 2 },
          recentLogs: [],
          publishedJobId: "job-1",
          publishedTreePaths: [["course-1", "note-1"]],
          issues: { forbidden: 0, error: 1 },
        }),
      }),
    );

    const { result, unmount } = renderHook(() => {
      const [courseErrors, setCourseErrors] = React.useState<
        Record<string, string>
      >({});
      const [forbiddenCourses, setForbiddenCourses] = React.useState<
        Record<string, boolean>
      >({});
      const [syncedCourses, setSyncedCourses] = React.useState<
        Record<string, boolean>
      >({});
      const [, setConnectionError] = React.useState<string | null>(null);

      return useCanvasImport({
        selectedCourseIds: [],
        courses: [],
        courseErrors,
        setCourseErrors,
        forbiddenCourses,
        setForbiddenCourses,
        syncedCourses,
        setSyncedCourses,
        setConnectionError,
        t: (key) => key,
      });
    });

    act(() => result.current.startPolling("job-1"));

    await waitFor(() => {
      expect(storeMocks.refreshTreePaths).toHaveBeenCalledWith([
        ["course-1", "note-1"],
      ]);
      expect(localStorage.getItem("canvas_active_job")).toBeNull();
    });
    unmount();
  });

  it("publishes a completed job before polling its active successor", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      "canvas_active_job",
      JSON.stringify({ jobId: "job-a" }),
    );
    let finishTreeRefresh: (() => void) | undefined;
    storeMocks.refreshTreePaths.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishTreeRefresh = resolve;
      }),
    );
    const activeJob = {
      jobId: "job-b",
      phase: "processing",
      status: "processing",
      jobType: "sync",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          activeJob,
          latestJob: activeJob,
          progress: { percent: 25, completed: 1, total: 4 },
          recentLogs: [],
          publishedJobId: "job-a",
          publishedTreePaths: [["course-a", "note-a"]],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          activeJob,
          latestJob: activeJob,
          progress: { percent: 50, completed: 2, total: 4 },
          recentLogs: [],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => {
      const [courseErrors, setCourseErrors] = React.useState<
        Record<string, string>
      >({});
      const [forbiddenCourses, setForbiddenCourses] = React.useState<
        Record<string, boolean>
      >({});
      const [syncedCourses, setSyncedCourses] = React.useState<
        Record<string, boolean>
      >({});
      const [, setConnectionError] = React.useState<string | null>(null);

      return useCanvasImport({
        selectedCourseIds: [],
        courses: [],
        courseErrors,
        setCourseErrors,
        forbiddenCourses,
        setForbiddenCourses,
        syncedCourses,
        setSyncedCourses,
        setConnectionError,
        t: (key) => key,
      });
    });

    act(() => result.current.startPolling("job-a"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(storeMocks.refreshTreePaths).toHaveBeenCalledWith([
      ["course-a", "note-a"],
    ]);
    expect(localStorage.getItem("canvas_active_job")).toBe(
      JSON.stringify({ jobId: "job-a" }),
    );

    await act(async () => {
      finishTreeRefresh?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(localStorage.getItem("canvas_active_job")).toBe(
      JSON.stringify({ jobId: "job-b" }),
    );
    expect(result.current.isImporting).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/canvas/status?publishJobId=job-b",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.isImporting).toBe(true);
    act(() => result.current.stopPolling());
    unmount();
  });

  it("keeps every restriction reported during a long-running poll", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse("course-a"))
      .mockResolvedValueOnce(statusResponse("course-b"));
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => {
      const [courseErrors, setCourseErrors] = React.useState<Record<string, string>>({});
      const [forbiddenCourses, setForbiddenCourses] = React.useState<Record<string, boolean>>({});
      const [syncedCourses, setSyncedCourses] = React.useState<Record<string, boolean>>({});
      const [, setConnectionError] = React.useState<string | null>(null);

      return {
        forbiddenCourses,
        importer: useCanvasImport({
          selectedCourseIds: [],
          courses: [],
          courseErrors,
          setCourseErrors,
          forbiddenCourses,
          setForbiddenCourses,
          syncedCourses,
          setSyncedCourses,
          setConnectionError,
          t: (key) => key,
        }),
      };
    });

    act(() => result.current.importer.startPolling());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(result.current.forbiddenCourses).toEqual({
      "course-a": true,
      "course-b": true,
    });

    act(() => result.current.importer.stopPolling());
    unmount();
  });
});
