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
  withErrorHandler: (h: (r: NextRequest) => Promise<Response>) => h,
  ApiError: class extends Error { constructor(public status: number, msg: string) { super(msg); } },
}));

vi.mock("@/lib/queue", () => ({ enqueueCanvasJob: vi.fn().mockResolvedValue(undefined) }));

import sql from "@/database/pgsql.js";
import { requireAuth } from "@/lib/api-error";
import { POST } from "@/app/api/vault/import/start/route";

const body = (data: Record<string, unknown>) =>
  new NextRequest("http://localhost/api/vault/import/start", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "content-type": "application/json" },
  });

describe("POST /api/vault/import/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "u1" } as never);
  });

  it("returns 409 when active import exists", async () => {
    vi.mocked(sql).mockResolvedValueOnce([{ id: "existing" }] as never);
    const res = await POST(body({ s3Key: "vault-uploads/u1/abc/x.zip" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ activeJobId: "existing" });
  });

  it("starts immediately when no active job", async () => {
    vi.mocked(sql).mockResolvedValueOnce([] as never);
    vi.mocked(sql).mockResolvedValueOnce([{ id: "new" }] as never);
    const res = await POST(body({ s3Key: "vault-uploads/u1/abc/x.zip" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ jobId: "new" });
  });

  it("starts when force=true even if active job exists", async () => {
    vi.mocked(sql).mockResolvedValueOnce([{ id: "existing" }] as never);
    vi.mocked(sql).mockResolvedValueOnce([] as never); // cancel
    vi.mocked(sql).mockResolvedValueOnce([{ id: "new" }] as never); // insert
    const res = await POST(body({ s3Key: "vault-uploads/u1/abc/x.zip", force: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ jobId: "new" });
  });
});
