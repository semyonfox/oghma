import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { s3Send } = vi.hoisted(() => ({ s3Send: vi.fn() }));

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn() as unknown as { begin: ReturnType<typeof vi.fn> } & ReturnType<typeof vi.fn>;
  sqlMock.mockResolvedValue([]);
  sqlMock.begin = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(sqlMock));
  return { default: sqlMock };
});

vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler: (h: (r: NextRequest) => Promise<Response>) => h,
  ApiError: class extends Error { constructor(public statusCode: number, public userMessage: string, public internalDetails?: string) { super(userMessage); } },
}));

vi.mock("@/lib/queue", () => ({ enqueueCanvasJob: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class { send = s3Send; },
  HeadObjectCommand: class { constructor(public input: unknown) {} },
}));
vi.mock("@/lib/storage/s3", () => ({
  createS3ClientConfig: vi.fn(() => ({})),
  createS3ConfigFromEnv: vi.fn(() => ({ bucket: "test" })),
}));

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
    process.env.STORAGE_BUCKET = "test";
    s3Send.mockResolvedValue({
      ContentLength: 12,
      Metadata: { "expected-size": "12" },
    } as never);
  });

  it("rejects an object whose final size differs from the authorized upload", async () => {
    s3Send.mockResolvedValueOnce({
      ContentLength: 13,
      Metadata: { "expected-size": "12" },
    } as never);
    await expect(POST(body({ s3Key: "vault-uploads/u1/abc/x.zip" }))).rejects.toMatchObject({ statusCode: 400 });
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns 409 when active import exists", async () => {
    vi.mocked(sql).mockResolvedValueOnce([{ id: "existing" }] as never);
    const res = await POST(body({ s3Key: "vault-uploads/u1/abc/x.zip" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ activeJobId: "existing" });
  });

  it("returns the active job after a concurrent insert hits the unique constraint", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: "concurrent" }] as never);
    (sql as unknown as { begin: ReturnType<typeof vi.fn> }).begin.mockRejectedValueOnce({ code: "23505" });

    const res = await POST(body({ s3Key: "vault-uploads/u1/abc/x.zip" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ activeJobId: "concurrent" });
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
