import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  return { default: sqlMock };
});
vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler: (h: (r: NextRequest, ctx: { params: Promise<{ jobId: string }> }) => Promise<Response>) => h,
  ApiError: class extends Error {
    constructor(public statusCode: number, public userMessage: string, public internalDetails?: string) {
      super(userMessage);
    }
  },
}));

import sql from "@/database/pgsql";
import { requireAuth } from "@/lib/api-error";
import { DELETE } from "@/app/api/vault/jobs/[jobId]/cancel/route";

const JOB_ID = "11111111-1111-4111-8111-111111111111";

function cancel(jobId: string) {
  const req = new NextRequest(`http://localhost/api/vault/jobs/${jobId}/cancel`, { method: "DELETE" });
  return DELETE(req, { params: Promise.resolve({ jobId }) } as never);
}

function queryText(): string {
  const [strings] = vi.mocked(sql).mock.calls[0];
  return Array.isArray(strings) ? strings.join("?") : "";
}

describe("DELETE /api/vault/jobs/[jobId]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "u1" } as never);
  });

  it("requests cancellation for the caller's own vault job only", async () => {
    vi.mocked(sql).mockResolvedValueOnce([{ id: JOB_ID, status: "processing" }] as never);

    const res = await cancel(JOB_ID);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ jobId: JOB_ID, status: "processing" });
    const text = queryText();
    expect(text).toContain("user_id = ?::uuid");
    expect(text).toContain("type IN ('vault-import', 'vault-export')");
    expect(vi.mocked(sql).mock.calls[0]).toContain("u1");
  });

  it("finishes a queued job immediately because no worker will ever claim it", async () => {
    vi.mocked(sql).mockResolvedValueOnce([{ id: JOB_ID, status: "cancelled" }] as never);

    const res = await cancel(JOB_ID);

    await expect(res.json()).resolves.toMatchObject({ status: "cancelled" });
    expect(queryText()).toContain("CASE WHEN status = 'queued' THEN 'cancelled'");
  });

  it("returns 404 when job not found or not owned by user", async () => {
    vi.mocked(sql).mockResolvedValueOnce([] as never);
    await expect(cancel(JOB_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns 404 for a malformed id instead of a uuid cast error", async () => {
    await expect(cancel("not-a-job")).rejects.toMatchObject({ statusCode: 404 });
    expect(sql).not.toHaveBeenCalled();
  });
});
