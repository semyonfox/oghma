import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn();
  Object.assign(sqlMock, { begin: vi.fn(
    async (callback: (tx: typeof sqlMock) => unknown) => callback(sqlMock),
  ) });
  return { default: sqlMock, afterDatabaseCommit: (effect: () => Promise<void>) => effect() };
});

vi.mock("uuid", () => ({
  v4: vi.fn(() => "11111111-1111-4111-8111-111111111111"),
}));

import sql from "@/database/pgsql";
import {
  CanvasFolderTrashedError, CanvasFolderMissingError,
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
      .mockResolvedValueOnce([{ note_id: folderId, deleted_at: new Date() }] as never); // trashed parent

    await expect(
      findOrCreateFolder(userId, "Week 1", folderId, {
        canvasCourseId: "101",
        canvasModuleId: "1",
      }),
    ).rejects.toBeInstanceOf(CanvasFolderTrashedError);
  });
});

it("distinguishes a missing parent from a folder in Trash", async () => {
  vi.mocked(sql).mockReset();
  vi.mocked(sql).mockResolvedValue([] as never);
  await expect(findOrCreateFolder(userId, "Week 1", folderId, { canvasCourseId: "101", canvasModuleId: "1" }))
    .rejects.toBeInstanceOf(CanvasFolderMissingError);
});

it("fails discovery on an unexpected database error instead of using the parent folder", async () => {
  vi.mocked(sql).mockReset();
  vi.mocked(sql)
    .mockResolvedValueOnce([] as never) // advisory lock
    .mockResolvedValueOnce([{ note_id: folderId, deleted_at: null }] as never) // active parent
    .mockRejectedValueOnce(new Error("canceling statement due to statement timeout"));

  await expect(findOrCreateFolder(userId, "Week 1", folderId, { canvasCourseId: "101", canvasModuleId: "1" }))
    .rejects.toThrow("statement timeout");
});

describe("Canvas module position", () => {
  const queries = () =>
    (vi.mocked(sql).mock.calls as unknown as Array<[TemplateStringsArray, ...unknown[]]>).map(([parts, ...values]) => ({
      text: Array.from(parts).join(""),
      values,
    }));

  beforeEach(() => {
    vi.mocked(sql).mockReset();
    vi.mocked(sql).mockResolvedValue([] as never);
  });

  it("stores the position on a new module folder", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never) // advisory lock
      .mockResolvedValueOnce([{ note_id: folderId, deleted_at: null }] as never) // active parent
      .mockResolvedValueOnce([] as never); // no existing module folder

    await findOrCreateFolder(userId, "Week 2", folderId, {
      canvasCourseId: "101",
      canvasModuleId: "7",
      canvasModulePosition: 2,
    });

    const insert = queries().find((query) => query.text.includes("INSERT INTO app.notes"));
    expect(insert?.text).toContain("canvas_module_position");
    expect(insert?.values).toContain(2);
  });

  it("fills the position in on an existing folder at the next sync, only when it changed", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never) // advisory lock
      .mockResolvedValueOnce([{ note_id: folderId, deleted_at: null }] as never) // active parent
      .mockResolvedValueOnce([{ note_id: "44444444-4444-4444-8444-444444444444", deleted_at: null }] as never);

    await findOrCreateFolder(userId, "Week 2", folderId, {
      canvasCourseId: "101",
      canvasModuleId: "7",
      canvasModulePosition: 3,
    });

    const update = queries().find((query) => query.text.includes("SET canvas_module_position"));
    expect(update?.values).toContain(3);
    expect(update?.text).toContain("IS DISTINCT FROM");
  });

  it("keeps the stored position when canvas sends none", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ note_id: folderId, deleted_at: null }] as never)
      .mockResolvedValueOnce([{ note_id: "44444444-4444-4444-8444-444444444444", deleted_at: null }] as never);

    await findOrCreateFolder(userId, "Week 2", folderId, { canvasCourseId: "101", canvasModuleId: "7" });

    expect(queries().some((query) => query.text.includes("SET canvas_module_position"))).toBe(false);
  });
});
