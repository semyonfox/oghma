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

vi.mock("@/lib/rate-limiter", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/vault/artifacts", () => ({
  reserveVaultExport: vi.fn().mockResolvedValue(undefined),
  lockVaultExport: vi.fn().mockResolvedValue(undefined),
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

// route each query by its text so adding a query does not shift every mock
function routeQueries(routes: {
  active?: Array<{ id: string }>[];
  inserted?: string;
}) {
  const active = [...(routes.active ?? [])];
  vi.mocked(sql).mockImplementation((async (strings: unknown) => {
    const text = Array.isArray(strings) ? strings.join("?") : "";
    if (text.includes("SELECT id FROM app.canvas_import_jobs")) {
      return active.shift() ?? [];
    }
    if (text.includes("INSERT INTO app.canvas_import_jobs")) {
      return [{ id: routes.inserted ?? "new-job" }];
    }
    return [];
  }) as never);
}

const exportRequest = (query = "") =>
  new NextRequest(`http://localhost/api/vault/export${query}`, { method: "POST" });

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
    routeQueries({ active: [[{ id: "existing-job" }]] });

    const res = await POST(exportRequest());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.activeJobId).toBe("existing-job");
  });

  it("expires a dead worker's job before checking for an active export", async () => {
    routeQueries({});

    await POST(exportRequest());

    const texts = vi.mocked(sql).mock.calls.map(queryText);
    const expire = texts.findIndex((text) => text.includes("updated_at < NOW() - INTERVAL '30 minutes'"));
    const active = texts.findIndex((text) => text.includes("SELECT id FROM app.canvas_import_jobs"));
    expect(expire).toBeGreaterThanOrEqual(0);
    expect(expire).toBeLessThan(active);
  });

  it("returns the active job after a concurrent insert hits the unique constraint", async () => {
    routeQueries({ active: [[], [{ id: "concurrent-job" }]] });
    vi.mocked(sql.begin).mockRejectedValueOnce({ code: "23505" });

    const response = await POST(exportRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      activeJobId: "concurrent-job",
    });
    expect(enqueueCanvasJob).not.toHaveBeenCalled();
  });

  it("cancels existing job and starts new one when force=true", async () => {
    routeQueries({ active: [[{ id: "existing-job" }]] });

    const res = await POST(exportRequest("?force=true"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe("new-job");
    expect(
      vi.mocked(sql).mock.calls.map(queryText).some((text) =>
        text.includes("SET status = 'cancelled'") && text.includes("cancel_requested_at = NOW()"),
      ),
    ).toBe(true);
  });

  it("starts immediately when no active job exists", async () => {
    routeQueries({});

    const res = await POST(exportRequest());
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
    routeQueries({});
    vi.mocked(enqueueCanvasJob).mockRejectedValueOnce(
      new Error("queue unavailable"),
    );

    await expect(POST(exportRequest())).rejects.toThrow("queue unavailable");

    const cleanupCall = vi
      .mocked(sql)
      .mock.calls.find((call) => queryText(call).includes("SET status = 'failed'") && call.includes("new-job"));
    expect(cleanupCall).toBeDefined();
  });
});
