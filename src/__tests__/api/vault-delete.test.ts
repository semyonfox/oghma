import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn() as ReturnType<typeof vi.fn> & {
    begin: ReturnType<typeof vi.fn>;
  };
  sqlMock.mockResolvedValue([]);
  sqlMock.begin = vi.fn(
    async (callback: (tx: typeof sqlMock) => unknown) => callback(sqlMock),
  );
  return { default: sqlMock };
});

vi.mock("@/lib/rateLimiter", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/canvas/cancel-import-jobs", () => ({
  cancelActiveCanvasImportJobs: vi.fn(),
}));
vi.mock("@/lib/notes/storage/note-lifecycle", () => ({
  permanentlyDeleteAllUserNotes: vi.fn(),
  queueVaultStorageCleanup: vi.fn(),
}));
vi.mock("@/lib/api-error", () => ({
  withErrorHandler: (handler: () => Promise<Response>) => handler,
  requireAuth: vi.fn(),
}));

import sql from "@/database/pgsql.js";
import { checkRateLimit } from "@/lib/rateLimiter";
import { cancelActiveCanvasImportJobs } from "@/lib/canvas/cancel-import-jobs";
import {
  permanentlyDeleteAllUserNotes,
  queueVaultStorageCleanup,
} from "@/lib/notes/storage/note-lifecycle";
import { requireAuth } from "@/lib/api-error";
import { DELETE } from "@/app/api/vault/route";

describe("DELETE /api/vault", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "user-123" } as never);
    vi.mocked(checkRateLimit).mockResolvedValue(null as never);
    vi.mocked(cancelActiveCanvasImportJobs).mockResolvedValue([] as never);
    vi.mocked(permanentlyDeleteAllUserNotes).mockResolvedValue({
      noteIds: ["note-123"],
      cleanupTaskId: null,
      objectKeys: 1,
    });
    vi.mocked(queueVaultStorageCleanup).mockResolvedValue(false);
    vi.mocked(sql).mockResolvedValue([] as never);
  });

  it("bypasses Trash, fences imports, and uses durable permanent cleanup", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const response = await DELETE(
      new NextRequest("http://localhost/api/vault", { method: "DELETE" }),
    );

    expect(response.status).toBe(200);
    expect(cancelActiveCanvasImportJobs).toHaveBeenCalledWith(
      expect.any(Function),
      "user-123",
      "Vault permanently cleared by user",
    );
    expect(permanentlyDeleteAllUserNotes).toHaveBeenCalledWith("user-123");
    expect(queueVaultStorageCleanup).toHaveBeenCalledWith("user-123");
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      summary: { notesDeleted: 1, s3FilesDeleted: 1, cleanupPending: false },
    });
  });
});
