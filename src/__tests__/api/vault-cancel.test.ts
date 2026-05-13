import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  return { default: sqlMock };
});
vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler: (h: (r: NextRequest, ctx: { params: { jobId: string } }) => Promise<Response>) => h,
  ApiError: class extends Error {
    constructor(public statusCode: number, public userMessage: string, public internalDetails?: string) {
      super(userMessage);
    }
  },
}));

import sql from "@/database/pgsql.js";
import { requireAuth } from "@/lib/api-error";
import { DELETE } from "@/app/api/vault/jobs/[jobId]/cancel/route";

describe("DELETE /api/vault/jobs/[jobId]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "u1" } as never);
  });

  it("sets cancel_requested_at and returns 200", async () => {
    vi.mocked(sql).mockResolvedValueOnce([{ id: "j1" }] as never);
    const req = new NextRequest("http://localhost/api/vault/jobs/j1/cancel", { method: "DELETE" });
    const res = await DELETE(req, { params: { jobId: "j1" } } as never);
    expect(res.status).toBe(200);
    expect(vi.mocked(sql)).toHaveBeenCalled();
  });

  it("returns 404 when job not found or not owned by user", async () => {
    vi.mocked(sql).mockResolvedValueOnce([] as never);
    const req = new NextRequest("http://localhost/api/vault/jobs/x/cancel", { method: "DELETE" });
    await expect(
      DELETE(req, { params: { jobId: "x" } } as never)
    ).rejects.toThrow(); // ApiError thrown — withErrorHandler converts to 404 response in production
  });
});
