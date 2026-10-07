import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/canvas/execution", async (original) => ({
  ...await original<typeof import("@/lib/canvas/execution")>(),
  withCanvasExecution: (_owner: unknown, work: () => Promise<unknown>) => work(),
}));

vi.mock("@/database/pgsql", () => {
  const db = vi.fn();
  Object.assign(db, { begin: (work: (tx: typeof db) => Promise<unknown>) => work(db) });
  return { default: db };
});

const canvas = vi.hoisted(() => ({
  getModules: vi.fn(), getModuleItems: vi.fn(), getFile: vi.fn(),
  getAssignments: vi.fn(), getCourseFiles: vi.fn(), getAssignment: vi.fn(),
}));
vi.mock("@/lib/canvas/client", () => ({
  CanvasClient: class {
    baseUrl = "https://canvas.example.test/api/v1";
    getModules = canvas.getModules;
    getModuleItems = canvas.getModuleItems;
    getFile = canvas.getFile;
    getAssignments = canvas.getAssignments;
    getCourseFiles = canvas.getCourseFiles;
    getAssignment = canvas.getAssignment;
  },
}));

vi.mock("@/lib/canvas/import-scheduler.ts", () => ({
  dispatchFairCanvasFiles: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/canvas/import-extraction", () => ({
  PROCESSABLE_TYPES: new Set(["application/pdf"]),
  FILE_CONCURRENCY: 1,
  resolveMimeType: vi.fn().mockReturnValue("application/pdf"),
  fetchResource: vi.fn(),
  recordCanvasResourceIssue: vi.fn(),
  isJobCancelled: vi.fn().mockResolvedValue(false),
  downloadAndStoreFile: vi.fn(),
  checkAndCompleteJob: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/crypto.ts", () => ({
  decrypt: vi.fn(() => "token"),
}));

vi.mock("@/lib/logger.ts", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/lib/canvas/canvas-folders", async (original) => ({
  ...await original<typeof import("@/lib/canvas/canvas-folders")>(),
  findOrCreateFolder: vi.fn(),
}));
vi.mock("@/lib/canvas/sync-assignments", () => ({ syncAssignmentMetadata: vi.fn().mockResolvedValue({ synced: 0, errors: 0 }) }));
import { CanvasFolderTrashedError, findOrCreateFolder } from "@/lib/canvas/canvas-folders";
import { fetchResource, checkAndCompleteJob } from "@/lib/canvas/import-extraction";
import sql from "@/database/pgsql";
import { dispatchFairCanvasFiles } from "@/lib/canvas/import-scheduler.ts";
import {
  parseJobCourses,
  processDiscoverJob,
} from "@/lib/canvas/import-discovery";

describe("Canvas import job course contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves signed-bigint course IDs from serialized jobs", () => {
    expect(
      parseJobCourses({
        course_ids: JSON.stringify(["9007199254740993"]),
      }),
    ).toEqual([
      {
        id: "9007199254740993",
        name: "9007199254740993",
        course_code: "",
        term: null,
      },
    ]);
  });

  it("rejects IDs beyond PostgreSQL's signed-bigint range at job parsing", () => {
    expect(() =>
      parseJobCourses({ course_ids: ["9223372036854775808"] }),
    ).toThrow("supported Canvas ID range");
  });

  it("rejects malformed job course collections", () => {
    expect(() => parseJobCourses({ course_ids: { id: "42" } })).toThrow(
      "course_ids must be an array",
    );
  });
});

describe("Canvas discovery finalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes a job when discovery only produced forbidden rows", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([
        {
          id: "11111111-1111-4111-8111-111111111111",
          user_id: "22222222-2222-4222-8222-222222222222",
          course_ids: [],
          started_at: new Date(),
        },
      ] as never)
      .mockResolvedValueOnce([
        { canvas_token: "encrypted", canvas_domain: "canvas.example.edu" },
      ] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ count: "10" }] as never)
      .mockResolvedValueOnce([
        { id: "11111111-1111-4111-8111-111111111111" },
      ] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    await expect(
      processDiscoverJob("11111111-1111-4111-8111-111111111111"),
    ).resolves.toBe(true);

    expect(dispatchFairCanvasFiles).not.toHaveBeenCalled();
    expect(checkAndCompleteJob).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    );
    const pendingQuery = vi.mocked(sql).mock.calls[5]?.[0] as unknown as
      | TemplateStringsArray
      | undefined;
    expect(Array.from(pendingQuery ?? []).join("")).toContain(
      "status = 'pending'",
    );
  });
});


describe("Trash during nested module discovery", () => {
  beforeEach(() => {
    vi.mocked(sql).mockReset();
    vi.clearAllMocks();
  });

  it("skips only the trashed module, continues siblings, and excludes its files from the flat inventory", async () => {
    vi.mocked(sql).mockImplementation(async (parts) => {
      const query = Array.from(parts).join("");
      if (query.includes("RETURNING *")) return [{ user_id: "22222222-2222-4222-8222-222222222222", course_ids: ["56273", "56274"], started_at: new Date() }] as never;
      if (query.includes("canvas_token")) return [{ canvas_token: "encrypted", canvas_domain: "example.test" }] as never;
      if (query.includes("COUNT(*)")) return [{ count: "0" }] as never;
      if (query.includes("INSERT INTO app.canvas_imports")) return [{ id: "file", status: "pending" }] as never;
      if (query.includes("RETURNING id")) return [{ id: "job" }] as never;
      return [] as never;
    });
    vi.mocked(findOrCreateFolder).mockImplementation(async (_user, _title, _parent, canvas) => {
      if (String(canvas?.canvasModuleId) === "1") throw new CanvasFolderTrashedError("trashed-module");
      return "active-course";
    });
    vi.mocked(fetchResource).mockImplementation(async (_fn, course, _user, _title, resource) => {
      if (course === "56273" && resource === "modules") return { data: [{ id: 1, name: "Week one" }, { id: 2, name: "Week two" }], forbidden: false } as never;
      if (resource === "module 1 files") return { data: [{ type: "File", content_id: 42 }], forbidden: false } as never;
      if (resource === "module 2 files") return { data: [{ type: "File", content_id: 43 }], forbidden: false } as never;
      if (resource === "module file 43") return { data: { id: 43, display_name: "Keep.pdf", content_type: "application/pdf" }, forbidden: false } as never;
      if (course === "56273" && resource === "files") return { data: [{ id: 42, display_name: "Deleted.pdf", content_type: "application/pdf" }, { id: 43, display_name: "Keep.pdf", content_type: "application/pdf" }], forbidden: false } as never;
      return { data: [], forbidden: false } as never;
    });
    await expect(processDiscoverJob("11111111-1111-4111-8111-111111111111")).resolves.toBe(true);
    expect(findOrCreateFolder).toHaveBeenCalledWith(expect.any(String), expect.any(String), null, expect.objectContaining({ canvasCourseId: "56274" }));
    expect(findOrCreateFolder).toHaveBeenCalledWith(expect.any(String), "Week two", "active-course", expect.objectContaining({ canvasModuleId: "2" }));
    const inserts = vi.mocked(sql).mock.calls.filter(([parts]) => Array.from(parts).join("").includes("INSERT INTO app.canvas_imports"));
    expect(inserts).toHaveLength(2);
    expect(dispatchFairCanvasFiles).toHaveBeenCalled();
    const transitionIndex = vi.mocked(sql).mock.calls.findIndex(([parts]) =>
      Array.from(parts).join("").includes("SET status = 'processing', expected_total"));
    expect(transitionIndex).toBeGreaterThan(-1);
    expect(vi.mocked(dispatchFairCanvasFiles).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(sql).mock.invocationCallOrder[transitionIndex],
    );
    expect(inserts.every((call) => !call.slice(1).includes("42"))).toBe(true);
    expect(vi.mocked(sql).mock.calls.some(([parts]) => Array.from(parts).join("").includes("'{skippedFolders}'"))).toBe(true);
  });
});

describe("partial Canvas discovery", () => {
  const jobId = "11111111-1111-4111-8111-111111111111";
  const userId = "22222222-2222-4222-8222-222222222222";

  beforeEach(async () => {
    vi.clearAllMocks();
    const actual = await vi.importActual<typeof import("@/lib/canvas/import-extraction")>("@/lib/canvas/import-extraction");
    vi.mocked(fetchResource).mockImplementation(actual.fetchResource);
    vi.mocked(findOrCreateFolder).mockResolvedValue("33333333-3333-4333-8333-333333333333");
    canvas.getAssignments.mockResolvedValue({ data: [], forbidden: false });
    canvas.getCourseFiles.mockResolvedValue({ data: [], forbidden: false });
    vi.mocked(sql).mockReset().mockImplementation(async (parts) => {
      const query = Array.from(parts).join("");
      if (query.includes("RETURNING *")) return [{ user_id: userId, course_ids: ["42", "43"], started_at: new Date(), execution_attempts: 3 }] as never;
      if (query.includes("canvas_token")) return [{ canvas_token: "encrypted", canvas_domain: "example.test" }] as never;
      if (query.includes("COUNT(*)")) return [{ count: "4" }] as never;
      if (query.includes("INSERT INTO app.canvas_imports")) return [{ id: "file", status: "pending" }] as never;
      if (query.includes("RETURNING id")) return [{ id: jobId }] as never;
      if (query.includes("SELECT user_id FROM app.canvas_import_jobs")) return [{ user_id: userId }] as never;
      if (query.includes("RETURNING status")) return [{ status: "failed" }] as never;
      return [] as never;
    });
  });

  it("processes valid files despite an inaccessible course, broken module, and missing sibling file", async () => {
    canvas.getModules.mockImplementation(async (courseId: string) => courseId === "42"
      ? { data: null, forbidden: false, error: "Canvas API error: 404" }
      : { data: [{ id: "10", name: "Unavailable week" }, { id: "11", name: "Working week" }], forbidden: false });
    canvas.getModuleItems.mockImplementation(async (_courseId: string, moduleId: string) => moduleId === "10"
      ? { data: null, forbidden: false, error: "Canvas API error: 503" }
      : { data: [{ type: "File", content_id: "9", title: "Missing.pdf" },
        { type: "File", content_id: "10", title: "Keep.pdf" }], forbidden: false });
    canvas.getFile.mockImplementation(async (_courseId: string, fileId: string) => fileId === "9"
      ? { data: null, forbidden: false, error: "Canvas API error: 404" }
      : { data: { id: "10", display_name: "Keep.pdf", content_type: "application/pdf" }, forbidden: false });

    await expect(processDiscoverJob(jobId)).resolves.toBe(true);

    const inserts = vi.mocked(sql).mock.calls.filter(([parts]) => Array.from(parts).join("").includes("INSERT INTO app.canvas_imports"));
    expect(inserts.filter((call) => call.includes("error"))).toHaveLength(3);
    expect(inserts.some((call) => call.includes("Missing.pdf") && call.includes("9"))).toBe(true);
    expect(inserts.some((call) => call.includes("Keep.pdf") && call.includes("pending"))).toBe(true);
    expect(canvas.getAssignments).toHaveBeenCalledWith("42");
    expect(canvas.getCourseFiles).toHaveBeenCalledWith("43");
    expect(dispatchFairCanvasFiles).toHaveBeenCalled();
    expect(checkAndCompleteJob).toHaveBeenCalledWith(jobId, userId);
    expect(vi.mocked(sql).mock.calls.some(([parts]) => Array.from(parts).join("").includes("Parent discovery failed"))).toBe(false);
  });

  it("settles an entirely inaccessible selection with per-section issues", async () => {
    canvas.getModules.mockResolvedValue({ data: null, forbidden: false, error: "Canvas API error: 404" });
    canvas.getAssignments.mockResolvedValue({ data: [], forbidden: true, error: "Access restricted" });
    canvas.getCourseFiles.mockResolvedValue({ data: [], forbidden: false, error: "Canvas API error: 410" });

    await expect(processDiscoverJob(jobId)).resolves.toBe(true);
    expect(checkAndCompleteJob).toHaveBeenCalledWith(jobId, userId);
    expect(canvas.getCourseFiles).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sql).mock.calls.filter(([parts]) => Array.from(parts).join("").includes("INSERT INTO app.canvas_imports"))).toHaveLength(6);
  });

  it("retains files from earlier pages when a later inventory page is restricted", async () => {
    canvas.getModules.mockResolvedValue({ data: [], forbidden: false });
    canvas.getCourseFiles.mockResolvedValue({ data: [{ id: "10", display_name: "Keep.pdf", content_type: "application/pdf" }],
      forbidden: true, error: "Access restricted by lecturer" });
    await expect(processDiscoverJob(jobId)).resolves.toBe(true);
    const inserts = vi.mocked(sql).mock.calls.filter(([parts]) => Array.from(parts).join("").includes("INSERT INTO app.canvas_imports"));
    expect(inserts.some((call) => call.includes("Keep.pdf") && call.includes("pending"))).toBe(true);
    expect(inserts.some((call) => call.includes("forbidden"))).toBe(true);
  });

  it("imports an assignment's valid attachment even when another description link is missing", async () => {
    vi.mocked(sql).mockResolvedValueOnce([{ user_id: userId, course_ids: [{ id: "42", assignmentId: "7" }],
      started_at: new Date(), execution_attempts: 1 }] as never);
    canvas.getAssignment.mockResolvedValue({ data: { id: "7", name: "Streams assignment",
      description: '<a href="/files/9">Missing</a><a href="/files/10">Working</a>' }, forbidden: false });
    canvas.getFile.mockImplementation(async (_courseId: string, fileId: string) => fileId === "9"
      ? { data: null, forbidden: false, error: "Canvas API error: 404" }
      : { data: { id: "10", display_name: "Keep.pdf", content_type: "application/pdf" }, forbidden: false });
    await expect(processDiscoverJob(jobId)).resolves.toBe(true);
    const inserts = vi.mocked(sql).mock.calls.filter(([parts]) => Array.from(parts).join("").includes("INSERT INTO app.canvas_imports"));
    expect(inserts.some((call) => call.includes("File 9") && call.includes("error"))).toBe(true);
    expect(inserts.some((call) => call.includes("Keep.pdf") && call.includes("pending"))).toBe(true);
    expect(canvas.getModules).not.toHaveBeenCalled();
  });

  it("keeps an expired connection as a parent failure instead of reporting successful discovery", async () => {
    canvas.getModules.mockResolvedValue({ data: null, forbidden: false, unauthorized: true, error: "Invalid or expired Canvas token" });
    await expect(processDiscoverJob(jobId)).resolves.toBe(false);
    expect(checkAndCompleteJob).not.toHaveBeenCalled();
    expect(vi.mocked(sql).mock.calls.some((call) => call.includes("Canvas course discovery failed: Invalid or expired Canvas token"))).toBe(true);
  });
});
