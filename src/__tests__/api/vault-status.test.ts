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

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class { send() {} },
  GetObjectCommand: class { constructor(public input: unknown) {} },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed.example/file.zip"),
}));

import sql from "@/database/pgsql.js";
import { requireAuth } from "@/lib/api-error";
import { GET } from "@/app/api/vault/status/route";

describe("GET /api/vault/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "u1" } as never);
    process.env.STORAGE_BUCKET = "test";
  });

  it("returns export progress with processed_files", async () => {
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: "j1",
        type: "vault-export",
        status: "processing",
        created_at: "2026-05-13T00:00:00Z",
        started_at: "2026-05-13T00:00:01Z",
        completed_at: null,
        expected_total: 100,
        processed_files: 42,
        cancel_requested_at: null,
        output_s3_key: null,
        download_url: null,
        error_message: null,
      },
    ] as never);

    const res = await GET(
      new NextRequest("http://localhost/api/vault/status?type=vault-export"),
    );
    const body = await res.json();

    expect(body.progress).toEqual({ completed: 42, total: 100, percent: 42 });
    expect(body.job.cancelRequested).toBe(false);
  });

  it("flags cancelRequested when cancel_requested_at is set", async () => {
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: "j1",
        type: "vault-import",
        status: "processing",
        created_at: "2026-05-13T00:00:00Z",
        started_at: "2026-05-13T00:00:01Z",
        completed_at: null,
        expected_total: 10,
        processed_files: 3,
        cancel_requested_at: "2026-05-13T00:01:00Z",
        output_s3_key: null,
        download_url: null,
        error_message: null,
      },
    ] as never);

    const res = await GET(
      new NextRequest("http://localhost/api/vault/status?type=vault-import"),
    );
    const body = await res.json();

    expect(body.job.cancelRequested).toBe(true);
  });
});
