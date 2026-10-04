import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ load: vi.fn(), discover: vi.fn(), sql: vi.fn(), start: vi.fn(), enqueue: vi.fn(), course: vi.fn() }));
vi.mock("@/lib/auth", () => ({ validateSession: vi.fn(), validateSessionLite: vi.fn() }));
vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/canvas/load-assignment", () => ({ loadCanvasAssignment: mocks.load }));
vi.mock("@/lib/canvas/assignment-materials", () => ({ discoverAssignmentMaterials: mocks.discover }));
vi.mock("@/lib/canvas/import-runs", () => ({ startCanvasRun: mocks.start }));
vi.mock("@/lib/queue", () => ({ enqueueCanvasJob: mocks.enqueue }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
import { GET, POST } from "@/app/api/assignments/[id]/materials/route";
import { ApiError } from "@/lib/api-error";
const userId = "123e4567-e89b-42d3-a456-426614174002";
const context = { params: Promise.resolve({ id: "123e4567-e89b-42d3-a456-426614174001" }) };
const request = (method: string) => new NextRequest("http://localhost/api/assignments/task/materials", { method });
const pdf = { id: "10", file: { id: "10", display_name: "Brief.pdf", content_type: "application/pdf" }, unavailable: false };

describe("assignment materials API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue({ userId, courseId: "7", assignmentId: "8", assignment: { id: "8", name: "Essay" }, client: { baseUrl: "https://canvas.example.edu/api/v1", getCourse: mocks.course } });
    mocks.discover.mockResolvedValue([pdf]);
    mocks.sql.mockResolvedValue([]);
    mocks.course.mockResolvedValue({ data: { id: "7", name: "History", course_code: "H1" } });
    mocks.start.mockResolvedValue({ kind: "created", jobId: "job-1" });
    mocks.enqueue.mockResolvedValue(undefined);
  });
  it("finds existing imported notes for the current user", async () => {
    mocks.sql.mockResolvedValue([{ file_id: "10", status: "complete", note_id: "note-1", deleted: false }]);
    const response = await GET(request("GET"), context);
    expect(await response.json()).toMatchObject({ materials: [{ id: "10", noteId: "note-1", status: "imported", url: "https://canvas.example.edu/courses/7/files/10" }] });
    expect(mocks.sql.mock.calls[0]).toContain(userId);
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("does not offer trashed, restricted or unsupported files for import", async () => {
    mocks.discover.mockResolvedValue([pdf, { id: "11", file: null, unavailable: true }, { id: "12", file: { id: "12", display_name: "Program.zip" }, unavailable: false }]);
    mocks.sql.mockResolvedValue([{ file_id: "10", status: "complete", note_id: null, deleted: true }]);
    const response = await GET(request("GET"), context);
    expect(await response.json()).toMatchObject({ materials: [{ status: "trashed", noteId: null }, { status: "unavailable" }, { status: "unsupported" }] });
    await POST(request("POST"), context);
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("queues only the selected assignment using the normal import worker", async () => {
    const response = await POST(request("POST"), context);
    expect(await response.json()).toEqual({ queued: true, jobId: "job-1" });
    expect(mocks.start).toHaveBeenCalledWith({ userId, courses: [{ id: "7", name: "History", course_code: "H1", term: null, assignmentId: "8" }], mode: "import", checkTrash: true });
    expect(mocks.enqueue).toHaveBeenCalledWith("canvas-discover", { userId, jobId: "job-1" });
  });
  it("leaves another active import alone", async () => {
    mocks.start.mockResolvedValue({ kind: "conflict", activeJob: { jobId: "other" } });
    const response = await POST(request("POST"), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Another Canvas import") });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("does not dispatch duplicate active jobs", async () => {
    mocks.start.mockResolvedValue({ kind: "existing", jobId: "job-1" });
    expect((await POST(request("POST"), context)).status).toBe(200);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("keeps queued work recoverable when the queue is unavailable", async () => {
    mocks.enqueue.mockRejectedValue(new Error("Unavailable"));
    expect(await (await POST(request("POST"), context)).json()).toEqual({ queued: true, jobId: "job-1" });
  });
  it("does not discover files without an owned assignment", async () => {
    mocks.load.mockRejectedValue(new ApiError(404, "Not found"));
    expect((await GET(request("GET"), context)).status).toBe(404);
    expect(mocks.discover).not.toHaveBeenCalled();
  });
});
