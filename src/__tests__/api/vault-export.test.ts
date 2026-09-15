import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql", () => {
  const sqlMock = vi.fn() as unknown as { begin: ReturnType<typeof vi.fn> } & ReturnType<typeof vi.fn>;
  sqlMock.mockResolvedValue([]);
  sqlMock.begin = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(sqlMock));
  return { default: sqlMock };
});

vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler: (handler: (req: NextRequest) => Promise<Response>) => handler,
  ApiError: class extends Error {
    constructor(public statusCode: number, public userMessage: string, public internalDetails?: string) { super(userMessage); }
  },
}));

vi.mock("@/lib/queue", () => ({
  enqueueCanvasJob: vi.fn().mockResolvedValue(undefined),
}));

import sql from "@/database/pgsql";
import { requireAuth } from "@/lib/api-error";
import { enqueueCanvasJob } from "@/lib/queue";
import { POST } from "@/app/api/vault/export/route";

function queryText(call: unknown[]): string {
  const [strings] = call;
  return Array.isArray(strings) ? strings.join("?") : "";
}

describe("POST /api/vault/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sql).mockReset().mockResolvedValue([] as never);
    vi.mocked(sql.begin)
      .mockReset()
      .mockImplementation(async (callback) => {
        const transactionCallback: unknown = callback;
        if (typeof transactionCallback !== "function") {
          throw new TypeError("expected a transaction callback");
        }
        return transactionCallback(sql as never) as never;
      });
    vi.mocked(enqueueCanvasJob).mockReset().mockResolvedValue(undefined);
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "u1" } as never);
  });

  it("returns 409 when an active export already exists", async () => {
    vi.mocked(sql).mockResolvedValueOnce([{ id: "existing-job" }] as never);

    const res = await POST(new NextRequest("http://localhost/api/vault/export", { method: "POST" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.activeJobId).toBe("existing-job");
  });

  it("returns the active job after a concurrent insert hits the unique constraint", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: "concurrent-job" }] as never);
    vi.mocked(sql.begin).mockRejectedValueOnce({ code: "23505" });

    const response = await POST(
      new NextRequest("http://localhost/api/vault/export", { method: "POST" }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      activeJobId: "concurrent-job",
    });
    expect(enqueueCanvasJob).not.toHaveBeenCalled();
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
    expect(enqueueCanvasJob).toHaveBeenCalledWith(
      "vault-export",
      { jobId: "new-job", userId: "u1" },
      { attempts: 1 },
    );
  });

  it("marks the durable job failed when queue publication fails", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: "new-job" }] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(enqueueCanvasJob).mockRejectedValueOnce(
      new Error("queue unavailable"),
    );

    await expect(
      POST(
        new NextRequest("http://localhost/api/vault/export", {
          method: "POST",
        }),
      ),
    ).rejects.toThrow("queue unavailable");

    const cleanupCall = vi
      .mocked(sql)
      .mock.calls.find((call) => queryText(call).includes("SET status = 'failed'"));
    expect(cleanupCall).toBeDefined();
    expect(cleanupCall).toContain("new-job");
  });
});
