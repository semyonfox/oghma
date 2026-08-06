import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const storage = {
  deleteObject: vi.fn(),
};

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  return { default: sqlMock };
});

vi.mock("@/lib/auth", () => ({ validateSession: vi.fn() }));
vi.mock("@/lib/rateLimiter", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/storage/init", () => ({
  getStorageProvider: () => storage,
}));
vi.mock("@/lib/qdrant", () => ({ deleteChunkVectors: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/api-error", () => ({
  withErrorHandler: (handler: () => Promise<Response>) => handler,
  tracedError: (message: string, status: number) =>
    Response.json({ error: message }, { status }),
}));

import sql from "@/database/pgsql.js";
import { validateSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimiter";
import { deleteChunkVectors } from "@/lib/qdrant";
import { DELETE } from "@/app/api/vault/route";

describe("DELETE /api/vault", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateSession).mockResolvedValue({ user_id: "user-123" } as never);
    vi.mocked(checkRateLimit).mockResolvedValue(null as never);
    vi.mocked(deleteChunkVectors).mockResolvedValue(undefined);
    storage.deleteObject.mockResolvedValue(undefined);
  });

  it("preserves shared imported cache objects while removing the user's private files", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([
        { s3_key: "imports/shared/aabbcc.pdf" },
        { s3_key: "notes/user-123/private.pdf" },
      ] as never)
      .mockResolvedValueOnce([{ id: "chunk-123" }] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const response = await DELETE(
      new NextRequest("http://localhost/api/vault", { method: "DELETE" }),
    );

    expect(response.status).toBe(200);
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
    expect(storage.deleteObject).toHaveBeenCalledWith("notes/user-123/private.pdf");
    expect(storage.deleteObject).not.toHaveBeenCalledWith("imports/shared/aabbcc.pdf");
    expect(deleteChunkVectors).toHaveBeenCalledWith(["chunk-123"]);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      summary: { s3FilesDeleted: 1 },
    });
  });
});
