import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  return { default: sqlMock };
});

vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler: (handler: () => Promise<Response>) => handler,
}));

import sql from "@/database/pgsql";
import { requireAuth } from "@/lib/api-error";
import { GET } from "@/app/api/canvas/status/route";

const JOB_ID = "11111111-1111-4111-8111-111111111111";

describe("GET /api/canvas/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "user-123" } as never);
  });

  it("keeps pending_marker files active until GPU indexing finishes", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([
        {
          id: JOB_ID,
          status: "processing",
          job_type: "import",
          created_at: "2026-04-20T12:00:00.000Z",
          started_at: "2026-04-20T12:00:05.000Z",
          completed_at: null,
          expected_total: 5,
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          total: 5,
          indexed: 1,
          indexing: 1,
          downloading: 1,
          processing: 0,
          pending_retry: 0,
          pending_marker: 2,
          forbidden: 0,
          error: 0,
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          filename: "lecture.pdf",
          status: "pending_marker",
          error_message: null,
          updated_at: "2026-04-20T12:01:00.000Z",
          canvas_course_id: 42,
          note_id: "note-123",
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          leaf_note_id: "note-123",
          tree_path: ["course-123", "module-123", "note-123"],
        },
      ] as never);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/canvas/status?publishJobId=${JOB_ID}`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.activeJob).toMatchObject({
      jobId: JOB_ID,
      status: "processing",
      phase: "processing",
    });
    expect(body.latestJob).toMatchObject({
      jobId: JOB_ID,
      status: "processing",
      jobType: "import",
    });
    expect(body.progress).toMatchObject({
      total: 5,
      completed: 2,
      pendingMarker: 2,
      percent: 40,
    });
    expect(body.markerColdStarting).toBe(false);
    expect(body.estimatedSecsRemaining).toBeGreaterThan(0);
    expect(body.recentLogs[0]).toMatchObject({
      filename: "lecture.pdf",
      status: "pending_marker",
      courseId: "42",
      noteId: "note-123",
      treePath: ["course-123", "module-123", "note-123"],
    });
  });

  it("does not estimate completion before any file has settled", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([
        {
          id: "job-123",
          status: "processing",
          job_type: "import",
          created_at: "2026-04-20T12:00:00.000Z",
          started_at: "2026-04-20T12:00:05.000Z",
          completed_at: null,
          expected_total: 5,
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          total: 1,
          indexed: 0,
          indexing: 1,
          downloading: 0,
          processing: 0,
          pending_retry: 0,
          pending_marker: 0,
          forbidden: 0,
          error: 0,
        },
      ] as never)
      .mockResolvedValueOnce([] as never);

    const response = await GET(
      new NextRequest("http://localhost/api/canvas/status"),
    );
    const body = await response.json();

    expect(body.progress.completed).toBe(1);
    expect(body.estimatedSecsRemaining).toBeNull();
  });

  it("does not report a failed parent as 100 percent complete", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([
        {
          id: "job-123",
          status: "failed",
          job_type: "import",
          created_at: "2026-04-20T12:00:00.000Z",
          started_at: "2026-04-20T12:00:05.000Z",
          completed_at: null,
          expected_total: 1,
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          total: 1,
          indexed: 0,
          indexing: 0,
          downloading: 0,
          processing: 0,
          pending_retry: 1,
          pending_marker: 0,
          forbidden: 0,
          error: 0,
        },
      ] as never)
      .mockResolvedValueOnce([] as never);

    const response = await GET(
      new NextRequest("http://localhost/api/canvas/status"),
    );
    const body = await response.json();

    expect(body.activeJob).toBeNull();
    expect(body.progress).toMatchObject({ retrying: 1, percent: 0 });
    expect(body.publishedTreePaths).toEqual([]);
    expect(sql).toHaveBeenCalledTimes(3);
  });

  it("returns every published tree path after a job exceeds the log limit", async () => {
    const publishedNotes = Array.from({ length: 55 }, (_, index) => ({
      note_id: `note-${index + 1}`,
    }));
    const recentLogs = publishedNotes.slice(5).map(({ note_id }) => ({
      filename: `${note_id}.md`,
      status: "complete",
      error_message: null,
      updated_at: "2026-04-20T12:10:00.000Z",
      canvas_course_id: 42,
      note_id,
    }));
    const treePaths = publishedNotes.map(({ note_id }) => ({
      leaf_note_id: note_id,
      tree_path: ["course-123", "module-123", note_id],
    }));

    vi.mocked(sql)
      .mockResolvedValueOnce([
        {
          id: JOB_ID,
          status: "complete",
          job_type: "import",
          created_at: "2026-04-20T12:00:00.000Z",
          started_at: "2026-04-20T12:00:05.000Z",
          completed_at: "2026-04-20T12:10:00.000Z",
          expected_total: 55,
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          total: 55,
          indexed: 55,
          indexing: 0,
          downloading: 0,
          processing: 0,
          pending_retry: 0,
          pending_marker: 0,
          forbidden: 0,
          error: 0,
        },
      ] as never)
      .mockResolvedValueOnce(recentLogs as never)
      .mockResolvedValueOnce(publishedNotes as never)
      .mockResolvedValueOnce(treePaths as never);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/canvas/status?publishJobId=${JOB_ID}`,
      ),
    );
    const body = await response.json();

    expect(body.recentLogs).toHaveLength(50);
    expect(body.publishedTreePaths).toHaveLength(55);
    expect(body.publishedTreePaths).toContainEqual([
      "course-123",
      "module-123",
      "note-1",
    ]);
  });

  it("rejects an invalid publish job ID before querying import state", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/canvas/status?publishJobId=not-a-uuid",
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid Canvas import job ID",
    });
    expect(sql).not.toHaveBeenCalled();
  });
});
