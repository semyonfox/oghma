import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  return { default: sqlMock };
});

vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler: (handler: () => Promise<Response>) => handler,
}));

import sql from "@/database/pgsql.js";
import { requireAuth } from "@/lib/api-error";
import { GET } from "@/app/api/canvas/status/route";

describe("GET /api/canvas/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "user-123" } as never);
  });

  it("counts pending_marker files as settled progress", async () => {
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
          total: 5,
          indexed: 1,
          indexing: 1,
          downloading: 1,
          processing: 0,
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
      ] as never);

    const response = await GET(
      new NextRequest("http://localhost/api/canvas/status"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.activeJob).toMatchObject({
      jobId: "job-123",
      status: "processing",
      phase: "processing",
    });
    expect(body.progress).toMatchObject({
      total: 5,
      completed: 2,
      pendingMarker: 2,
      percent: 80,
    });
    expect(body.recentLogs[0]).toMatchObject({
      filename: "lecture.pdf",
      status: "pending_marker",
      noteId: "note-123",
    });
  });
});
