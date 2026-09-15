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

vi.mock("@/lib/canvas/client", () => ({
  CanvasClient: vi.fn(),
}));

vi.mock("@/lib/canvas/import-scheduler.ts", () => ({
  dispatchFairCanvasFiles: vi.fn(),
}));

vi.mock("@/lib/canvas/import-extraction", () => ({
  PROCESSABLE_TYPES: new Set(["application/pdf"]),
  FILE_CONCURRENCY: 1,
  resolveMimeType: vi.fn().mockReturnValue("application/pdf"),
  fetchResource: vi.fn(),
  isJobCancelled: vi.fn().mockResolvedValue(false),
  downloadAndStoreFile: vi.fn(),
}));

vi.mock("@/lib/crypto.ts", () => ({
  decrypt: vi.fn(() => "token"),
}));

vi.mock("@/lib/logger.ts", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/canvas/canvas-folders", async (original) => ({
  ...await original<typeof import("@/lib/canvas/canvas-folders")>(),
  findOrCreateFolder: vi.fn(),
}));
vi.mock("@/lib/canvas/sync-assignments", () => ({ syncAssignmentMetadata: vi.fn().mockResolvedValue({ synced: 0, errors: 0 }) }));
import { CanvasFolderTrashedError, findOrCreateFolder } from "@/lib/canvas/canvas-folders";
import { fetchResource } from "@/lib/canvas/import-extraction";
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
    const pendingQuery = vi.mocked(sql).mock.calls[5]?.[0] as unknown as
      | TemplateStringsArray
      | undefined;
    expect(Array.from(pendingQuery ?? []).join("")).toContain(
      "status = 'pending'",
    );
    const completionQuery = vi.mocked(sql).mock.calls.at(-1)?.[0] as unknown as
      | TemplateStringsArray
      | undefined;
    expect(Array.from(completionQuery ?? []).join("")).toContain(
      "SET status = 'complete'",
    );
  });
});


describe("Trash during nested module discovery", () => {
  it("skips only the trashed module, continues siblings, and excludes its files from the flat inventory", async () => {
    vi.mocked(sql).mockImplementation(async (parts) => {
      const query = Array.from(parts).join("");
      if (query.includes("RETURNING *")) return [{ user_id: "22222222-2222-4222-8222-222222222222", course_ids: ["56273", "56274"], started_at: new Date() }] as never;
      if (query.includes("canvas_token")) return [{ canvas_token: "encrypted", canvas_domain: "example.test" }] as never;
      if (query.includes("COUNT(*)")) return [{ count: "0" }] as never;
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
    expect(inserts.every((call) => !call.slice(1).includes("42"))).toBe(true);
    expect(vi.mocked(sql).mock.calls.some(([parts]) => Array.from(parts).join("").includes("'{skippedFolders}'"))).toBe(true);
  });
});
