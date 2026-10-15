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
  ApiError: class extends Error {
    constructor(
      public statusCode: number,
      public userMessage: string,
      public internalDetails?: string,
    ) {
      super(userMessage);
    }
  },
}));

const { signVaultExportDownload } = vi.hoisted(() => ({
  signVaultExportDownload: vi.fn().mockResolvedValue("https://signed.example/file.zip"),
}));
// the real findLiveVaultExport runs against the routed sql mock; only signing is faked
vi.mock("@/lib/vault/artifacts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/vault/artifacts")>()),
  signVaultExportDownload,
}));

import sql from "@/database/pgsql";
import { requireAuth } from "@/lib/api-error";
import { GET } from "@/app/api/vault/status/route";

interface JobRow {
  id: string;
  type: string;
  status: string;
  expected_total: number | null;
  processed_files: number;
  cancel_requested_at: string | null;
  error_message: string | null;
}

function jobRow(overrides: Partial<JobRow>): JobRow {
  return {
    id: "j1",
    type: "vault-export",
    status: "processing",
    expected_total: null,
    processed_files: 0,
    cancel_requested_at: null,
    error_message: null,
    ...overrides,
  };
}

function routeQueries(job: JobRow | null, artifact?: { s3_key: string; seconds_left: number }) {
  vi.mocked(sql).mockImplementation((async (strings: unknown) => {
    const text = Array.isArray(strings) ? strings.join("?") : "";
    if (text.includes("ORDER BY created_at DESC")) return job ? [job] : [];
    if (text.includes("FROM app.vault_artifacts")) return artifact ? [artifact] : [];
    return [];
  }) as never);
}

async function status(type: string) {
  const res = await GET(new NextRequest(`http://localhost/api/vault/status?type=${type}`));
  return res.json();
}

describe("GET /api/vault/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sql).mockReset().mockResolvedValue([] as never);
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "u1" } as never);
    process.env.STORAGE_BUCKET = "test";
  });

  it("returns export progress with processed_files", async () => {
    routeQueries(jobRow({ expected_total: 100, processed_files: 42 }));

    const body = await status("vault-export");

    expect(body.progress).toEqual({ completed: 42, total: 100, percent: 42 });
    expect(body.job.cancelRequested).toBe(false);
  });

  it("omits absent fields because the settings poller rejects null values", async () => {
    routeQueries(jobRow({ type: "vault-import", processed_files: 7 }));

    const body = await status("vault-import");

    expect(body.downloadUrl).toBeUndefined();
    expect(body.job).not.toHaveProperty("error");
    // imports stream the ZIP, so the total is unknown while they run
    expect(body.progress).toEqual({ completed: 7, total: 0 });
  });

  it("returns an empty body rather than job: null when there is no job", async () => {
    routeQueries(null);
    await expect(status("vault-import")).resolves.toEqual({});
  });

  it("expires stale jobs for this user before reading status", async () => {
    routeQueries(null);
    await status("vault-export");
    const [first] = vi.mocked(sql).mock.calls.map(([strings]) =>
      Array.isArray(strings) ? strings.join("?") : "",
    ).filter((text) => text.includes("UPDATE app.canvas_import_jobs"));
    expect(first).toContain("INTERVAL '30 minutes'");
  });

  it("signs completed exports with the displayed filename, capped to the archive lifetime", async () => {
    routeQueries(
      jobRow({ status: "complete", expected_total: 2, processed_files: 2 }),
      { s3_key: "exports/u1/j1/vault-export.zip", seconds_left: 600 },
    );

    const body = await status("vault-export");

    expect(signVaultExportDownload).toHaveBeenCalledWith("exports/u1/j1/vault-export.zip", 600);
    expect(body.downloadUrl).toBe("https://signed.example/file.zip");
  });

  it("offers no link once retention has removed the archive", async () => {
    routeQueries(jobRow({ status: "complete", expected_total: 2, processed_files: 2 }));

    const body = await status("vault-export");

    expect(signVaultExportDownload).not.toHaveBeenCalled();
    expect(body.downloadUrl).toBeUndefined();
    expect(body.job.status).toBe("complete");
  });

  it("flags cancelRequested when cancel_requested_at is set", async () => {
    routeQueries(jobRow({
      type: "vault-import",
      expected_total: 10,
      processed_files: 3,
      cancel_requested_at: "2026-05-13T00:01:00Z",
    }));

    const body = await status("vault-import");

    expect(body.job.cancelRequested).toBe(true);
  });
});
