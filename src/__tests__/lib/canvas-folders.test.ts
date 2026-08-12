import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn();
  Object.assign(sqlMock, { begin: vi.fn(
    async (callback: (tx: typeof sqlMock) => unknown) => callback(sqlMock),
  ) });
  return { default: sqlMock };
});

vi.mock("uuid", () => ({
  v4: vi.fn(() => "11111111-1111-4111-8111-111111111111"),
}));

import sql from "@/database/pgsql";
import {
  CanvasFolderTrashedError,
  findOrCreateFolder,
} from "@/lib/canvas/canvas-folders";

const userId = "22222222-2222-4222-8222-222222222222";
const folderId = "33333333-3333-4333-8333-333333333333";

describe("Canvas folder lifecycle fence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sql).mockReset();
    vi.mocked(sql).mockResolvedValue([] as never);
  });

  it("does not recreate a Canvas folder that is still in Trash", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never) // advisory lock
      .mockResolvedValueOnce([
        { note_id: folderId, deleted_at: new Date("2026-08-07T00:00:00Z") },
      ] as never);

    await expect(
      findOrCreateFolder(userId, "CS101", null, { canvasCourseId: "101" }),
    ).rejects.toBeInstanceOf(CanvasFolderTrashedError);
  });

  it("reuses an active Canvas folder under the lifecycle lock", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never) // advisory lock
      .mockResolvedValueOnce([{ note_id: folderId, deleted_at: null }] as never)
      .mockResolvedValueOnce([] as never); // idempotent tree row

    await expect(
      findOrCreateFolder(userId, "CS101", null, { canvasCourseId: "101" }),
    ).resolves.toBe(folderId);

    const queries = (vi.mocked(sql).mock.calls as Array<[TemplateStringsArray]>)
      .map(([parts]) => Array.from(parts).join(""));
    expect(queries.some((query: string) => query.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(queries.some((query: string) => query.includes("INSERT INTO app.tree_items"))).toBe(true);
  });

  it("refuses to attach a late Canvas child beneath a trashed parent", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never) // advisory lock
      .mockResolvedValueOnce([] as never); // no active parent

    await expect(
      findOrCreateFolder(userId, "Week 1", folderId, {
        canvasCourseId: "101",
        canvasModuleId: "1",
      }),
    ).rejects.toBeInstanceOf(CanvasFolderTrashedError);
  });
});
