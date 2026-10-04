import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const transactions = vi.hoisted(() => ({ begin: vi.fn() }));

vi.mock("@/database/pgsql", () => {
  const sqlMock = vi.fn() as ReturnType<typeof vi.fn> & {
    begin: ReturnType<typeof vi.fn>;
  };
  sqlMock.mockResolvedValue([]);
  sqlMock.begin = transactions.begin.mockImplementation(
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
  permanentlyDeleteNotes: vi.fn(),
  queueVaultStorageCleanup: vi.fn(),
}));
vi.mock("@/lib/api-error", () => ({
  withErrorHandler: (handler: () => Promise<Response>) => handler,
  requireAuth: vi.fn(),
}));

import sql from "@/database/pgsql";
import { checkRateLimit } from "@/lib/rateLimiter";
import { cancelActiveCanvasImportJobs } from "@/lib/canvas/cancel-import-jobs";
import {
  permanentlyDeleteAllUserNotes,
  permanentlyDeleteNotes,
  queueVaultStorageCleanup,
} from "@/lib/notes/storage/note-lifecycle";
import { requireAuth } from "@/lib/api-error";
import { DELETE } from "@/app/api/vault/route";

describe("DELETE /api/vault", () => {
  const jobs = [{
    id: "11111111-1111-1111-1111-111111111111",
    type: "vault-import",
    input_s3_key: "vault-uploads/user-123/old-upload/vault.zip",
  }];

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
    vi.mocked(permanentlyDeleteNotes).mockResolvedValue({
      noteIds: ["note-123"],
      cleanupTaskId: null,
      objectKeys: 1,
    });
    transactions.begin.mockImplementation(async (callback: (tx: typeof sql) => Promise<unknown>) => {
      return callback(sql);
    });
    vi.mocked(queueVaultStorageCleanup).mockResolvedValue(false);
    vi.mocked(sql).mockImplementation(async (strings) => {
      const query = Array.isArray(strings) ? strings.join(" ") : "";
      if (query.includes("SELECT id, type, input_s3_key")) return jobs as never;
      if (query.includes("SELECT id FROM app.canvas_imports")) {
        return [{ id: "old-import" }] as never;
      }
      if (query.includes("SELECT note_id FROM app.notes")) {
        return [{ note_id: "note-123" }] as never;
      }
      return [] as never;
    });
  });

  it("bypasses Trash, fences imports, and uses durable permanent cleanup", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/api/vault", { method: "DELETE" }),
    );

    expect(response.status).toBe(200);
    expect(cancelActiveCanvasImportJobs).toHaveBeenCalledWith(
      expect.any(Function),
      "user-123",
      "Vault permanently cleared by user",
    );
    expect(permanentlyDeleteNotes).toHaveBeenCalledWith("user-123", ["note-123"]);
    expect(permanentlyDeleteAllUserNotes).not.toHaveBeenCalled();
    expect(queueVaultStorageCleanup).toHaveBeenCalledWith("user-123", jobs);
    const deletes = vi.mocked(sql).mock.calls.filter(([strings]) =>
      Array.isArray(strings) && strings.join(" ").includes("DELETE FROM"),
    );
    expect(deletes).toHaveLength(2);
    expect(deletes[0]).toContainEqual(["old-import"]);
    expect(deletes[1]).toContainEqual([jobs[0].id]);
    expect(sql.begin).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      summary: { notesDeleted: 1, s3FilesDeleted: 1, cleanupPending: false },
    });
  });

  it("preserves a note created after the cancellation snapshot commits", async () => {
    const notes = new Set(["note-123"]);
    const deleteNotes = async (ids: string[]) => {
      for (const id of ids) notes.delete(id);
      return { noteIds: ids, cleanupTaskId: null, objectKeys: 0 };
    };
    vi.mocked(permanentlyDeleteAllUserNotes).mockImplementation(() => deleteNotes([...notes]));
    vi.mocked(permanentlyDeleteNotes).mockImplementation((_userId, ids) => deleteNotes(ids));
    transactions.begin.mockImplementationOnce(async (callback: (tx: typeof sql) => Promise<unknown>) => {
      const result = await callback(sql);
      notes.add("later-note");
      return result;
    });

    await DELETE(new NextRequest("http://localhost/api/vault", { method: "DELETE" }));

    expect(notes).toEqual(new Set(["later-note"]));
    expect(permanentlyDeleteNotes).toHaveBeenCalledWith("user-123", ["note-123"]);
  });

  it("does not delete jobs if import metadata deletion fails", async () => {
    const originalQuery = vi.mocked(sql).getMockImplementation()!;
    vi.mocked(sql).mockImplementation(async (...args) => {
      const query = Array.isArray(args[0]) ? args[0].join(" ") : "";
      if (query.includes("DELETE FROM app.canvas_imports")) throw new Error("delete failed");
      return originalQuery(...args);
    });

    await expect(DELETE(new NextRequest("http://localhost/api/vault", { method: "DELETE" })))
      .rejects.toThrow("delete failed");
    expect(vi.mocked(sql).mock.calls.some(([strings]) =>
      Array.isArray(strings) && strings.join(" ").includes("DELETE FROM app.canvas_import_jobs"),
    )).toBe(false);
  });

  it("rolls back import metadata when the following job deletion fails", async () => {
    const metadata = new Set(["old-import", "old-job"]);
    const originalQuery = vi.mocked(sql).getMockImplementation()!;
    transactions.begin.mockImplementation(async (callback: (tx: typeof sql) => Promise<unknown>) => {
      const saved = [...metadata];
      try {
        return await callback(sql);
      } catch (error) {
        metadata.clear();
        for (const id of saved) metadata.add(id);
        throw error;
      }
    });
    vi.mocked(sql).mockImplementation(async (...args) => {
      const query = Array.isArray(args[0]) ? args[0].join(" ") : "";
      if (query.includes("DELETE FROM app.canvas_imports")) metadata.delete("old-import");
      if (query.includes("DELETE FROM app.canvas_import_jobs")) throw new Error("job delete failed");
      return originalQuery(...args);
    });

    await expect(DELETE(new NextRequest("http://localhost/api/vault", { method: "DELETE" })))
      .rejects.toThrow("job delete failed");
    expect(metadata).toEqual(new Set(["old-import", "old-job"]));
  });
});
