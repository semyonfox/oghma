import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler: (handler: () => Promise<Response>) => handler,
  tracedError: (message: string, status: number) =>
    Response.json({ error: message }, { status }),
}));

import sql from "@/database/pgsql";
import { requireAuth } from "@/lib/api-error";
import { GET } from "@/app/api/canvas/logs/route";

const JOB_ID = "11111111-1111-4111-8111-111111111111";

function request(query = "") {
  return new NextRequest(`http://localhost/api/canvas/logs${query}`);
}

function queries(): string[] {
  return (vi.mocked(sql).mock.calls as unknown as Array<[TemplateStringsArray]>)
    .map(([parts]) => Array.from(parts).join(""));
}

describe("GET /api/canvas/logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "user-123" } as never);
  });

  it("scopes a job's logs by job_id, not by when the file row was first created", async () => {
    // a reused row from an older import still belongs to this job
    vi.mocked(sql)
      .mockResolvedValueOnce([{ id: JOB_ID }] as never)
      .mockResolvedValueOnce([{
        filename: "Week 1.pdf", status: "complete", error_message: null,
        mime_type: "application/pdf", created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-10-01T00:00:00.000Z",
      }] as never);

    const response = await GET(request(`?jobId=${JOB_ID}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ jobId: JOB_ID, count: 1 });
    const logsQuery = queries()[1];
    expect(logsQuery).toContain("job_id = ");
    expect(logsQuery).not.toContain("created_at >=");
    expect(vi.mocked(sql).mock.calls[1]).toContain(JOB_ID);
  });

  it("rejects a malformed job id before touching the database", async () => {
    const response = await GET(request("?jobId=not-a-uuid"));

    expect(response.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("does not reveal another user's job", async () => {
    vi.mocked(sql).mockResolvedValueOnce([] as never);

    const response = await GET(request(`?jobId=${JOB_ID}`));

    expect(response.status).toBe(404);
    expect(queries()[0]).toContain("user_id = ");
  });
});
