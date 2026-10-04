// @vitest-environment jsdom

import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const treeRefresh = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const treeState = vi.hoisted(() => ({ generation: 0 }));
const owner = vi.hoisted(() => ({
  isImporting: false,
  isDiscovering: false,
  importSummary: null as {
    imported: number;
    forbidden: number;
    failed: number;
    skipped: number;
  } | null,
  progress: null as {
    total: number;
    percent: number;
    completed: number;
    downloading: number;
    processing: number;
    jobType: string;
    forbidden: number;
    error: number;
  } | null,
  recentLogs: [] as Array<{ status?: string; courseId?: string }>,
  markerColdStarting: false,
  estimatedSecsRemaining: null as number | null,
  discovery: null,
  terminalStatus: null as string | null,
  retrySourceJobId: null as string | null,
  statusSnapshot: null as {
    activeJob?: { jobId?: string } | null;
    latestJob?: {
      jobId?: string;
      status?: string;
      errorMessage?: string | null;
    } | null;
    progress?: { completed?: number };
    recentLogs?: Array<{ status?: string; courseId?: string }>;
  } | null,
  checkStatus: vi.fn().mockResolvedValue(undefined),
  trackJob: vi.fn(),
  resetStatus: vi.fn(),
}));

vi.mock("@/components/canvas/canvas-import-notifications", () => ({
  useCanvasImportOwner: () => owner,
}));

vi.mock("@/lib/notes/state/tree", () => ({
  default: {
    getState: () => ({
      generation: treeState.generation,
      refreshTreePaths: treeRefresh,
    }),
  },
}));

import useCanvasImport from "@/components/settings/canvas/use-canvas-import";

function renderImporter(
  options: {
    selectedCourseIds?: string[];
    courses?: Array<{
      id: string;
      name: string;
      course_code: string;
      canvasStatus?: string;
    }>;
  } = {},
) {
  return renderHook(() => {
    const [courseErrors, setCourseErrors] = React.useState<
      Record<string, string>
    >({});
    const [forbiddenCourses, setForbiddenCourses] = React.useState<
      Record<string, boolean>
    >({});
    const [syncedCourses, setSyncedCourses] = React.useState<
      Record<string, boolean>
    >({});
    const [connectionError, setConnectionError] = React.useState<string | null>(
      null,
    );

    return {
      courseErrors,
      forbiddenCourses,
      syncedCourses,
      connectionError,
      importer: useCanvasImport({
        selectedCourseIds: options.selectedCourseIds ?? [],
        courses: options.courses ?? [],
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
}

describe("useCanvasImport shared status owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    owner.isImporting = false;
    owner.isDiscovering = false;
    owner.importSummary = null;
    owner.progress = null;
    owner.recentLogs = [];
    owner.markerColdStarting = false;
    owner.estimatedSecsRemaining = null;
    owner.discovery = null;
    owner.terminalStatus = null;
    owner.retrySourceJobId = null;
    treeState.generation = 0;
    owner.statusSnapshot = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("uses the shared owner without starting a settings status poller", () => {
    owner.isImporting = true;
    owner.isDiscovering = true;
    owner.progress = {
      total: 4,
      percent: 25,
      completed: 1,
      downloading: 1,
      processing: 2,
      jobType: "import",
      forbidden: 0,
      error: 0,
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderImporter();

    expect(result.current.importer.isImporting).toBe(true);
    expect(result.current.importer.isDiscovering).toBe(true);
    expect(result.current.importer.progress).toBe(owner.progress);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts an import through the shared owner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ jobId: "job-1" }),
      }),
    );
    const { result } = renderImporter({
      selectedCourseIds: ["course-1"],
      courses: [
        { id: "course-1", name: "Course", course_code: "CS101" },
      ],
    });

    await act(async () => {
      await result.current.importer.handleImport();
    });

    expect(owner.trackJob).toHaveBeenCalledWith("job-1", "import");
    expect(JSON.parse(localStorage.getItem("canvas_active_job") ?? "null")).toMatchObject({
      jobId: "job-1",
    });
  });

  it("lets the shared owner publish a cancelled import before clearing it", async () => {
    localStorage.setItem("canvas_active_job", JSON.stringify({ jobId: "job-1" }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ cancelled: true }),
      }),
    );
    const { result } = renderImporter();

    await act(async () => {
      await result.current.importer.handleCancel();
    });

    expect(owner.checkStatus).toHaveBeenCalledOnce();
    expect(owner.resetStatus).not.toHaveBeenCalled();
    expect(localStorage.getItem("canvas_active_job")).not.toBeNull();
  });

  it("applies course status from the owner's snapshots", async () => {
    const { result, rerender } = renderImporter({
      selectedCourseIds: ["course-1"],
      courses: [
        { id: "course-1", name: "Course", course_code: "CS101" },
      ],
    });

    owner.statusSnapshot = {
      activeJob: { jobId: "job-1" },
      latestJob: { jobId: "job-1", status: "processing" },
      recentLogs: [{ status: "forbidden", courseId: "course-2" }],
    };
    rerender();
    await waitFor(() => {
      expect(result.current.forbiddenCourses).toEqual({ "course-2": true });
    });

    owner.statusSnapshot = {
      activeJob: null,
      latestJob: { jobId: "job-1", status: "complete" },
      progress: { completed: 1 },
      recentLogs: [],
    };
    rerender();
    await waitFor(() => {
      expect(result.current.syncedCourses).toEqual({ "course-1": true });
    });
  });
});

describe("Canvas recovery controls", () => {
  const options: Parameters<typeof useCanvasImport>[0] = {
    selectedCourseIds: ["42"],
    courses: [{ id: "42", name: "Course", course_code: "CS101" }],
    courseErrors: {},
    setCourseErrors: () => undefined,
    forbiddenCourses: {},
    setForbiddenCourses: () => undefined,
    syncedCourses: {},
    setSyncedCourses: () => undefined,
    setConnectionError: () => undefined,
    t: (key) => key,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    owner.isImporting = false;
    owner.statusSnapshot = null;
    owner.retrySourceJobId = null;
    treeState.generation = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("requires another confirmation when the replacement target changes", async () => {
    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method !== "POST") throw new Error("Unexpected request");
        attempt += 1;
        return Response.json(
          {
            activeJob: {
              jobId: attempt === 1 ? "old-job" : "new-job",
              status: "processing",
            },
          },
          { status: 409 },
        );
      }),
    );
    const { result } = renderHook(() => useCanvasImport(options));

    await act(async () => result.current.handleImport());
    expect(result.current.pendingReplacement?.jobId).toBe("old-job");

    await act(async () => result.current.confirmReplacement());
    expect(result.current.pendingReplacement?.jobId).toBe("new-job");
    expect(owner.trackJob).toHaveBeenLastCalledWith("new-job", "import");
  });

  it("stops the tracked job and leaves terminal publication to the owner", async () => {
    owner.statusSnapshot = {
      activeJob: { jobId: "observed-job" },
      latestJob: { jobId: "observed-job", status: "processing" },
    };
    const fetchMock = vi.fn(async () => Response.json({ cancelled: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCanvasImport(options));

    await act(async () => result.current.handleCancel());

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/canvas/import?jobId=observed-job",
      expect.objectContaining({
        method: "DELETE",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(owner.checkStatus).toHaveBeenCalledOnce();
    expect(owner.resetStatus).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "requires an explicit Trash choice before starting, restore=%s",
    async (restore) => {
      const folder = {
        rootId: "root",
        title: "Course",
        deletedAt: "2026-09-15T00:00:00.000Z",
      };
      let imports = 0;
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/canvas/import" && init?.method === "POST") {
          imports += 1;
          return imports === 1
            ? Response.json(
                { code: "canvas_folders_in_trash", folders: [folder] },
                { status: 409 },
              )
            : Response.json({ jobId: "new-job", queued: true });
        }
        if (url === "/api/trash") return Response.json({ success: true });
        throw new Error("Unexpected request");
      });
      vi.stubGlobal("fetch", fetchMock);
      const { result } = renderHook(() => useCanvasImport(options));

      await act(async () => result.current.handleImport());
      expect(result.current.pendingTrash?.folders).toEqual([folder]);
      expect(imports).toBe(1);

      await act(async () => result.current.handleTrashChoice(restore));
      expect(result.current.pendingTrash).toBeNull();
      expect(imports).toBe(2);
      expect(
        fetchMock.mock.calls.filter(([url]) => url === "/api/trash"),
      ).toHaveLength(restore ? 1 : 0);
      expect(owner.trackJob).toHaveBeenLastCalledWith("new-job", "import");
    },
  );

  it("starts a retry job through the shared owner", async () => {
    owner.retrySourceJobId = "failed-job";
    const fetchMock = vi.fn(async () =>
      Response.json({ jobId: "retry-job", queued: true }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCanvasImport(options));

    await act(async () => result.current.handleRetry());

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/canvas/retry",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sourceJobId: "failed-job" }),
      }),
    );
    expect(owner.trackJob).toHaveBeenCalledWith("retry-job", "retry");
  });

  it("does not restore a job token after a workspace reset", async () => {
    let finishImport: ((response: Response) => void) | undefined;
    const importResponse = new Promise<Response>((resolve) => {
      finishImport = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(() => importResponse));
    const { result } = renderHook(() => useCanvasImport(options));

    let importPromise: Promise<void> | undefined;
    act(() => {
      importPromise = result.current.handleImport();
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    treeState.generation += 1;
    finishImport?.(Response.json({ jobId: "stale-job", queued: true }));
    await act(async () => {
      await importPromise;
    });

    expect(localStorage.getItem("canvas_active_job")).toBeNull();
    expect(owner.trackJob).not.toHaveBeenCalled();
  });

  it("leaves job recovery to the shared owner after settings unmounts", async () => {
    let finishImport: ((response: Response) => void) | undefined;
    const requestState: { signal?: AbortSignal } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          finishImport = resolve;
          requestState.signal = init?.signal ?? undefined;
          requestState.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
      ),
    );
    const { result, unmount } = renderHook(() => useCanvasImport(options));

    let importPromise: Promise<void> | undefined;
    act(() => {
      importPromise = result.current.handleImport();
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    unmount();
    expect(requestState.signal?.aborted).toBe(false);
    expect(owner.checkStatus).not.toHaveBeenCalled();
    finishImport?.(Response.json({ jobId: "navigated-job", queued: true }));
    await act(async () => {
      await importPromise;
    });

    expect(localStorage.getItem("canvas_active_job")).toBeNull();
    expect(owner.trackJob).not.toHaveBeenCalled();
    expect(owner.checkStatus).toHaveBeenCalledOnce();
  });
});
