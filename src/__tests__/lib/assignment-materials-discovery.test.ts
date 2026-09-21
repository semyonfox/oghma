import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn(), assignment: vi.fn(), file: vi.fn(), folder: vi.fn(), modules: vi.fn(), files: vi.fn(), assignments: vi.fn() }));
vi.mock("@/database/pgsql", () => ({ default: Object.assign(mocks.db, { begin: (work: (tx: typeof mocks.db) => Promise<unknown>) => work(mocks.db) }) }));
vi.mock("@/lib/canvas/execution", async original => ({
  ...await original<typeof import("@/lib/canvas/execution")>(),
  withCanvasExecution: (_owner: unknown, work: () => Promise<unknown>) => work(),
  withCanvasPublication: (work: () => Promise<unknown>) => work(),
}));
vi.mock("@/lib/canvas/client", () => ({ CanvasClient: class {
  baseUrl = "https://canvas.example.edu/api/v1";
  getAssignment = mocks.assignment;
  getFile = mocks.file;
  getModules = mocks.modules;
  getCourseFiles = mocks.files;
  getAssignments = mocks.assignments;
} }));
vi.mock("@/lib/canvas/canvas-folders", async original => ({ ...await original<typeof import("@/lib/canvas/canvas-folders")>(), findOrCreateFolder: mocks.folder }));
vi.mock("@/lib/canvas/import-extraction", () => ({
  PROCESSABLE_TYPES: new Set(["application/pdf"]), FILE_CONCURRENCY: 1,
  resolveMimeType: () => "application/pdf",
  fetchResource: (fetch: (course: string) => Promise<unknown>, course: string) => fetch(course),
  isJobCancelled: async () => false, downloadAndStoreFile: vi.fn(),
}));
vi.mock("@/lib/crypto.ts", () => ({ decrypt: () => "test-token" }));
vi.mock("@/lib/queue.ts", () => ({ getCanvasQueueAttemptLimit: () => 3 }));
vi.mock("@/lib/canvas/import-scheduler.ts", () => ({ dispatchFairCanvasFiles: vi.fn() }));
vi.mock("@/lib/canvas/sync-assignments", () => ({ syncAssignmentMetadata: vi.fn() }));
vi.mock("@/lib/logger.ts", () => ({ default: { info: vi.fn(), error: vi.fn() } }));
import { processDiscoverJob } from "@/lib/canvas/import-discovery";

describe("assignment-only import worker", () => {
  it("queues instruction files without walking other assignments, modules or course files", async () => {
    mocks.db.mockImplementation(async (parts: TemplateStringsArray) => {
      const query = parts.join("");
      if (query.includes("RETURNING *")) return [{ user_id: "user-1", course_ids: [{ id: "7", name: "History", assignmentId: "8" }], started_at: new Date() }];
      if (query.includes("canvas_token")) return [{ canvas_token: "encrypted", canvas_domain: "canvas.example.edu" }];
      if (query.includes("COUNT(*)")) return [{ count: "1" }];
      if (query.includes("RETURNING id")) return [{ id: "job-1" }];
      return [];
    });
    mocks.folder.mockResolvedValue("folder-1");
    mocks.assignment.mockResolvedValue({ data: { id: "8", name: "Essay", description: '<a href="/courses/7/files/10">Brief</a>' }, forbidden: false });
    mocks.file.mockResolvedValue({ data: { id: "10", display_name: "Brief.pdf", content_type: "application/pdf" }, forbidden: false });
    await expect(processDiscoverJob("job-1")).resolves.toBe(true);
    expect(mocks.assignment).toHaveBeenCalledWith("7", "8");
    expect(mocks.file).toHaveBeenCalledWith("7", "10");
    expect(mocks.modules).not.toHaveBeenCalled();
    expect(mocks.files).not.toHaveBeenCalled();
    expect(mocks.assignments).not.toHaveBeenCalled();
    const inserts = mocks.db.mock.calls.filter(([parts]) => parts.join("").includes("INSERT INTO app.canvas_imports"));
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toContain("10");
    expect(inserts[0]).toContain("canvas/user-1/7/assignments/8");
  });
});
