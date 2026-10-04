import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  validateSession: vi
    .fn()
    .mockResolvedValue({
      user_id: "00000000-0000-4000-8000-000000000001",
      session_version: 0,
    }),
}));
vi.mock("@/lib/config", () => ({
  config: { upload: { maxFileSizeBytes: 1024 } },
}));
vi.mock("@/lib/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/queue", () => ({ enqueueCanvasJob: vi.fn() }));
vi.mock("@/lib/storage/init", () => ({ getStorageProvider: vi.fn() }));
vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
import { POST } from "@/app/api/upload/route";
import sql from "@/database/pgsql";
import { getStorageProvider } from "@/lib/storage/init";

beforeEach(() => vi.clearAllMocks());
describe("multipart bounds at the upload entry point", () => {
  it.each([true, false])(
    "rejects an oversized body before multipart materialization (honest header: %s)",
    async (honest) => {
      const materialize = vi.spyOn(Response.prototype, "formData");
      try {
        const response = await POST(
          new NextRequest("https://example.test/api/upload", {
            method: "POST",
            headers: {
              "Content-Type": "multipart/form-data; boundary=fixture",
              "Content-Length": honest ? "66561" : "1",
            },
            body: new Uint8Array(66561),
          }),
        );
        expect(response.status).toBe(413);
        expect(materialize).not.toHaveBeenCalled();
        expect(sql).not.toHaveBeenCalled();
        expect(getStorageProvider).not.toHaveBeenCalled();
      } finally {
        materialize.mockRestore();
      }
    },
  );
});
