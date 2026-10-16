import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const sql = Object.assign(vi.fn(), {
    begin: vi.fn(
      async (callback: (transaction: typeof sql) => unknown) => callback(sql),
    ),
  });
  return { sql, setChunkVectorsSearchable: vi.fn() };
});

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/qdrant", () => ({
  deleteChunkVectors: vi.fn(),
  setChunkVectorsSearchable: mocks.setChunkVectorsSearchable,
}));

import { restoreTrashRoot } from "@/lib/notes/storage/note-lifecycle";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const ROOT_ID = "00000000-0000-4000-8000-000000000002";
const CHILD_ID = "00000000-0000-4000-8000-000000000003";

function queryText(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join("?");
}

describe("restoreTrashRoot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.mockResolvedValue([]);
    mocks.sql.begin.mockImplementation(
      async (callback: (transaction: typeof mocks.sql) => unknown) =>
        callback(mocks.sql),
    );
  });

  it("moves a restored bundle to the workspace root when its folder is unavailable", async () => {
    mocks.sql
      .mockResolvedValueOnce([]) // user tree lock
      .mockResolvedValueOnce([
        { note_id: ROOT_ID, title: "Week 1", is_folder: true, parent_id: "still-trashed" },
        { note_id: CHILD_ID, title: "Lecture", is_folder: false, parent_id: ROOT_ID },
      ]);

    await expect(restoreTrashRoot(USER_ID, ROOT_ID)).resolves.toMatchObject({
      rootId: ROOT_ID,
      noteIds: [ROOT_ID, CHILD_ID],
    });

    // the active tree only reads children of live folders, so without this
    // statement the restored bundle would be unreachable from the sidebar
    const placement = mocks.sql.mock.calls.find((call) =>
      queryText(call).includes("SET parent_id = NULL"),
    );
    expect(placement).toBeDefined();
    const text = queryText(placement!);
    expect(text).toContain("parent.deleted_at IS NULL");
    expect(text).toContain("parent.is_folder = TRUE");
    expect(placement!.slice(1)).toEqual([USER_ID, ROOT_ID, USER_ID]);
  });

  it("does not touch the tree when the bundle is no longer in Trash", async () => {
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(restoreTrashRoot(USER_ID, ROOT_ID)).resolves.toBeNull();

    expect(
      mocks.sql.mock.calls.some((call) => /(UPDATE|INSERT INTO) app\.(notes|tree_items)/.test(queryText(call))),
    ).toBe(false);
  });
});
