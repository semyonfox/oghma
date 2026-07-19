import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler: (handler: (request: NextRequest) => Promise<Response>) => handler,
  ApiError: class extends Error { constructor(public statusCode: number, message: string) { super(message); } },
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {},
  PutObjectCommand: class { constructor(public input: Record<string, unknown>) {} },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn().mockResolvedValue("signed-url") }));
vi.mock("@/lib/storage/s3", () => ({
  createS3ClientConfig: vi.fn(() => ({})),
  createS3ConfigFromEnv: vi.fn(() => ({ bucket: "test" })),
}));

import { requireAuth } from "@/lib/api-error";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { POST } from "@/app/api/vault/import/route";

const request = (body: unknown) => new NextRequest("http://localhost/api/vault/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/vault/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STORAGE_BUCKET = "test";
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "u1" } as never);
  });

  it("rejects path-like filenames and missing sizes", async () => {
    await expect(POST(request({ filename: "../import.zip", contentLength: 1 }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(POST(request({ filename: "import.zip", contentLength: 0 }))).rejects.toMatchObject({ statusCode: 400 });
  });

  it("accepts uppercase ZIP names and signs the upload constraints", async () => {
    await POST(request({ filename: "import.ZIP", contentLength: 12 }));
    const command = vi.mocked(getSignedUrl).mock.calls[0][1] as InstanceType<
      typeof PutObjectCommand
    >;

    expect(command.input).toMatchObject({
      ContentType: "application/zip",
      ContentLength: 12,
      Metadata: { "expected-size": "12" },
    });
    expect(command.input.Key).toMatch(/\/import\.ZIP$/);
    expect(vi.mocked(getSignedUrl).mock.calls[0][2]).toMatchObject({
      expiresIn: 900,
      signableHeaders: new Set(["content-type", "x-amz-meta-expected-size"]),
      unhoistableHeaders: new Set(["x-amz-meta-expected-size"]),
    });
  });
});
