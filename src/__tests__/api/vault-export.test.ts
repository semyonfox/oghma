import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn() as unknown as { begin: ReturnType<typeof vi.fn> } & ReturnType<typeof vi.fn>;
  sqlMock.mockResolvedValue([]);
  sqlMock.begin = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(sqlMock));
  return { default: sqlMock };
});

vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler: (handler: (req: NextRequest) => Promise<Response>) => handler,
  ApiError: class extends Error {
    constructor(public status: number, msg: string) { super(msg); }
  },
}));

vi.mock("@/lib/queue", () => ({
  enqueueCanvasJob: vi.fn().mockResolvedValue(undefined),
}));

import sql from "@/database/pgsql.js";
import { requireAuth } from "@/lib/api-error";
import { POST } from "@/app/api/vault/export/route";

describe("POST /api/vault/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "u1" } as never);
  });

  it("returns 409 when an active export already exists", async () => {
    vi.mocked(sql).mockResolvedValueOnce([{ id: "existing-job" }] as never);

    const res = await POST(new NextRequest("http://localhost/api/vault/export", { method: "POST" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.activeJobId).toBe("existing-job");
  });

  it("cancels existing job and starts new one when force=true", async () => {
    vi.mocked(sql).mockResolvedValueOnce([{ id: "existing-job" }] as never);
    vi.mocked(sql).mockResolvedValueOnce([] as never);
    vi.mocked(sql).mockResolvedValueOnce([{ id: "new-job" }] as never);

    const res = await POST(new NextRequest("http://localhost/api/vault/export?force=true", { method: "POST" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe("new-job");
  });

  it("starts immediately when no active job exists", async () => {
    vi.mocked(sql).mockResolvedValueOnce([] as never);
    vi.mocked(sql).mockResolvedValueOnce([{ id: "new-job" }] as never);

    const res = await POST(new NextRequest("http://localhost/api/vault/export", { method: "POST" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe("new-job");
  });
});
