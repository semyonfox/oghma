// @vitest-environment jsdom

import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
