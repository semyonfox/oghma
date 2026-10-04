import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: Object.assign(vi.fn(), { begin: vi.fn() }),
  cacheInvalidate: vi.fn(),
  deleteChunkVectors: vi.fn(),
  setChunkVectorsSearchable: vi.fn(),
  isSharedImportedFileKey: vi.fn(),
  getStorageProvider: vi.fn(),
  deleteObject: vi.fn(),
  deletePrefix: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/cache", () => ({
  cacheInvalidate: mocks.cacheInvalidate,
  cacheKeys: {
    treeFull: vi.fn(),
    notesList: vi.fn(),
    note: vi.fn(),
    treeChildren: vi.fn(),
  },
}));
vi.mock("@/lib/canvas/import-cache", () => ({
  isSharedImportedFileKey: mocks.isSharedImportedFileKey,
}));
vi.mock("@/lib/qdrant", () => ({
  deleteChunkVectors: mocks.deleteChunkVectors,
  setChunkVectorsSearchable: mocks.setChunkVectorsSearchable,
}));
vi.mock("@/lib/storage/init", () => ({
  getStorageProvider: mocks.getStorageProvider,
}));
vi.mock("@/lib/logger", () => ({
  default: { warn: mocks.warn, error: vi.fn() },
}));

import {
  permanentlyDeleteNotes,
  processPendingNoteDeletionCleanup,
  queueVaultStorageCleanup,
  type VaultCleanupJob,
} from "@/lib/notes/storage/note-lifecycle";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const OLD_JOB_ID = "33333333-3333-4333-8333-333333333333";
const NEW_JOB_ID = "44444444-4444-4444-8444-444444444444";
const TASK_ID = "55555555-5555-4555-8555-555555555555";
const OLD_PREFIX = `vault/${USER_ID}/${OLD_JOB_ID}/`;
const OLD_UPLOAD = `vault-uploads/${USER_ID}/old.zip`;

interface CleanupTask {
  id: string;
  user_id: string;
  note_ids: string[];
  chunk_ids: string[];
  object_keys: string[];
  object_prefixes: string[];
  lease_token: string | null;
  attempts: number;
  last_error: string | null;
}

const tasks = new Map<string, CleanupTask>();
const objects = new Map<string, string>();

function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected SQL string value");
  return value;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Expected SQL array value");
  return value.map(stringValue);
}

function taskWithScope(prefixes: string[]): CleanupTask {
  return {
    id: TASK_ID,
    user_id: USER_ID,
    note_ids: [],
    chunk_ids: [],
    object_keys: [],
    object_prefixes: prefixes,
    lease_token: null,
    attempts: 0,
    last_error: null,
  };
}

async function journalQuery(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<unknown[]> {
  const query = strings.join(" ").replace(/\s+/g, " ").trim();
  if (query.startsWith("INSERT INTO app.note_deletion_cleanup_tasks")) {
    const task = taskWithScope(stringArray(values[1]));
    task.user_id = stringValue(values[0]);
    task.object_keys = stringArray(values[2]);
    tasks.set(task.id, task);
    return [{ id: task.id }];
  }
  if (query.includes("SET lease_token = gen_random_uuid()")) {
    const task = tasks.get(stringValue(values[0]));
    if (!task || task.lease_token || task.last_error?.startsWith("Cleanup requires review:")) return [];
    task.lease_token = "66666666-6666-4666-8666-666666666666";
    return [{ ...task }];
  }
  if (query.includes("SET attempts = attempts + 1")) {
    const task = tasks.get(stringValue(values[1]));
    if (task && task.lease_token === values[2]) {
      task.attempts += 1;
      task.last_error = stringValue(values[0]);
      task.lease_token = null;
    }
    return [];
  }
  if (query.startsWith("DELETE FROM app.note_deletion_cleanup_tasks")) {
    const task = tasks.get(stringValue(values[0]));
    if (!task || task.lease_token !== values[1]) return [];
    tasks.delete(task.id);
    return [{ id: task.id }];
  }
  if (query.startsWith("SELECT id FROM app.note_deletion_cleanup_tasks")) {
    const quarantineEnabled = query.includes("last_error NOT LIKE 'Cleanup requires review:%'");
    return [...tasks.values()]
      .filter((task) => task.lease_token === null)
      .filter((task) => !quarantineEnabled || !task.last_error?.startsWith("Cleanup requires review:"))
      .slice(0, typeof values[0] === "number" ? values[0] : tasks.size)
      .map(({ id }) => ({ id }));
  }
  throw new Error(`Unexpected SQL query: ${query}`);
}

describe("vault cleanup scope", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    tasks.clear();
    objects.clear();
    mocks.sql.mockImplementation(journalQuery);
    mocks.sql.begin.mockImplementation(async (callback) => callback(mocks.sql));
    mocks.deleteChunkVectors.mockResolvedValue(undefined);
    mocks.isSharedImportedFileKey.mockImplementation((key: string) =>
      key.startsWith("imports/cache/"),
    );
    mocks.getStorageProvider.mockReturnValue({
      deleteObject: mocks.deleteObject,
      deletePrefix: mocks.deletePrefix,
    });
    mocks.deleteObject.mockImplementation(async (key: string) => {
      objects.delete(key);
    });
    mocks.deletePrefix.mockImplementation(async (prefix: string) => {
      for (const key of objects.keys()) {
        if (key.startsWith(prefix)) objects.delete(key);
      }
    });
  });

  it.each(["object", "prefix"] as const)(
    "preserves later imports when retrying a failed %s deletion",
    async (failure) => {
      const jobs: VaultCleanupJob[] = [{
        id: OLD_JOB_ID,
        type: "vault-import",
        input_s3_key: OLD_UPLOAD,
      }];
      objects.set(OLD_UPLOAD, "old zip");
      objects.set(`${OLD_PREFIX}notes/old.md`, "old note");
      objects.set(`${OLD_PREFIX}assets/old.png`, "old asset");
      const failedDelete = failure === "object"
        ? mocks.deleteObject
        : mocks.deletePrefix;
      failedDelete.mockRejectedValueOnce(new Error("storage unavailable"));

      await expect(queueVaultStorageCleanup(USER_ID, jobs)).resolves.toBe(true);

      expect(tasks.get(TASK_ID)).toMatchObject({
        user_id: USER_ID,
        object_prefixes: [OLD_PREFIX],
        object_keys: [OLD_UPLOAD],
        attempts: 1,
        last_error: "storage unavailable",
        lease_token: null,
      });
      expect(objects.has(`${OLD_PREFIX}notes/old.md`)).toBe(true);
      expect(mocks.warn).toHaveBeenCalledOnce();

      jobs.push({
        id: NEW_JOB_ID,
        type: "vault-import",
        input_s3_key: `vault-uploads/${USER_ID}/new.zip`,
      });
      const survivingObjects = new Map([
        [`vault/${USER_ID}/${NEW_JOB_ID}/notes/new.md`, "new note"],
        [`vault-uploads/${USER_ID}/new.zip`, "new zip"],
        [`vault-uploads/${USER_ID}/old.zip.backup`, "different upload"],
        [`vault/${OTHER_USER_ID}/${OLD_JOB_ID}/old.md`, "other user's note"],
        ["imports/cache/shared.pdf", "shared import"],
      ]);
      for (const [key, content] of survivingObjects) objects.set(key, content);

      await expect(processPendingNoteDeletionCleanup()).resolves.toBe(1);

      expect(objects).toEqual(survivingObjects);
      expect(tasks.size).toBe(0);
      expect(mocks.sql.begin).not.toHaveBeenCalled();
      expect(mocks.deleteObject.mock.calls.every(([key]) => key === OLD_UPLOAD)).toBe(true);
      expect(mocks.deletePrefix.mock.calls.every(([prefix]) => prefix === OLD_PREFIX)).toBe(true);
      expect(mocks.deleteChunkVectors).not.toHaveBeenCalled();
      await expect(processPendingNoteDeletionCleanup()).resolves.toBe(0);
    },
  );

  it.each([
    `vault/${USER_ID}/`,
    `vault-uploads/${USER_ID}/`,
    `vault/${OTHER_USER_ID}/${OLD_JOB_ID}/`,
    `${OLD_PREFIX}nested/`,
  ])("keeps unsafe prefix %s pending without deleting resources", async (prefix) => {
    const task = taskWithScope([OLD_PREFIX, prefix]);
    task.object_keys = [OLD_UPLOAD];
    task.note_ids = [OLD_JOB_ID];
    task.chunk_ids = [NEW_JOB_ID];
    tasks.set(task.id, task);
    objects.set(OLD_UPLOAD, "keep zip");
    objects.set(`${OLD_PREFIX}old.md`, "keep note");
    const before = new Map(objects);

    await expect(processPendingNoteDeletionCleanup()).resolves.toBe(0);

    expect(tasks.get(TASK_ID)).toMatchObject({
      attempts: 1,
      last_error: expect.stringContaining("Cleanup requires review"),
      lease_token: null,
    });
    expect(mocks.warn).toHaveBeenCalledOnce();
    await expect(processPendingNoteDeletionCleanup()).resolves.toBe(0);
    expect(tasks.get(TASK_ID)?.attempts).toBe(1);
    expect(objects).toEqual(before);
    expect(mocks.getStorageProvider).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.deletePrefix).not.toHaveBeenCalled();
    expect(mocks.deleteChunkVectors).not.toHaveBeenCalled();
    expect(mocks.setChunkVectorsSearchable).not.toHaveBeenCalled();
  });

  it("does not queue an empty snapshot or unrelated jobs", async () => {
    await expect(queueVaultStorageCleanup(USER_ID, [])).resolves.toBe(false);
    await expect(queueVaultStorageCleanup(USER_ID, [{
      id: OLD_JOB_ID,
      type: "canvas-import",
      input_s3_key: "imports/cache/shared.pdf",
    }])).resolves.toBe(false);

    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.getStorageProvider).not.toHaveBeenCalled();
  });

  it("quarantines a full legacy batch so later scoped tasks can progress", async () => {
    for (let index = 0; index < 50; index += 1) {
      const task = taskWithScope([`vault/${USER_ID}/`]);
      task.id = `77777777-7777-4777-8777-${String(index).padStart(12, "0")}`;
      tasks.set(task.id, task);
    }
    const valid = taskWithScope([OLD_PREFIX]);
    tasks.set(valid.id, valid);
    objects.set(`${OLD_PREFIX}old.md`, "old");

    await expect(processPendingNoteDeletionCleanup()).resolves.toBe(0);
    expect(tasks.size).toBe(51);
    await expect(processPendingNoteDeletionCleanup()).resolves.toBe(1);
    expect(tasks.size).toBe(50);
    expect(objects.size).toBe(0);
    expect([...tasks.values()].every((task) =>
      task.attempts === 1 && task.last_error?.startsWith("Cleanup requires review:"),
    )).toBe(true);

    const reviewed = [...tasks.values()][0];
    reviewed.object_prefixes = [OLD_PREFIX];
    reviewed.last_error = null;
    await expect(processPendingNoteDeletionCleanup()).resolves.toBe(1);
    expect(tasks.size).toBe(49);
  });

  it("preserves later notes and import metadata below a deleted snapshot folder", async () => {
    const notes = new Map([
      [OLD_JOB_ID, { note_id: OLD_JOB_ID, s3_key: null, content: "" }],
      [NEW_JOB_ID, { note_id: NEW_JOB_ID, s3_key: null, content: "later" }],
    ]);
    const imported = { note_id: NEW_JOB_ID, parent_folder_id: OLD_JOB_ID as string | null };
    const job = { id: NEW_JOB_ID, parent_folder_id: OLD_JOB_ID as string | null };
    let importedExists = true;
    let childParent: string | null = OLD_JOB_ID;
    mocks.sql.begin.mockImplementation(async (callback: (tx: typeof mocks.sql) => Promise<unknown>) =>
      callback(mocks.sql),
    );
    mocks.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join(" ").replace(/\s+/g, " ").trim();
      if (query.startsWith("SELECT note_id")) {
        return stringArray(values[1]).flatMap((id) => notes.has(id) ? [notes.get(id)] : []);
      }
      if (query.startsWith("UPDATE app.canvas_imports") && query.includes("SET parent_folder_id = NULL")) {
        imported.parent_folder_id = null;
      }
      if (query.startsWith("UPDATE app.canvas_import_jobs") && query.includes("SET parent_folder_id = NULL")) {
        job.parent_folder_id = null;
      }
      if (query.startsWith("DELETE FROM app.canvas_imports")) {
        const ids = stringArray(values[1]);
        if (ids.includes(imported.note_id) ||
          (query.includes("OR parent_folder_id") && imported.parent_folder_id && ids.includes(imported.parent_folder_id))) {
          importedExists = false;
        }
      }
      if (query.startsWith("UPDATE app.tree_items") && query.includes("SET parent_id = NULL")) {
        childParent = null;
      }
      if (query.startsWith("DELETE FROM app.notes")) {
        for (const id of stringArray(values[1])) notes.delete(id);
      }
      return [];
    });

    await expect(permanentlyDeleteNotes(USER_ID, [OLD_JOB_ID])).resolves.toMatchObject({
      noteIds: [OLD_JOB_ID],
    });
    expect([...notes.keys()]).toEqual([NEW_JOB_ID]);
    expect(importedExists).toBe(true);
    expect(imported.parent_folder_id).toBeNull();
    expect(job.parent_folder_id).toBeNull();
    expect(childParent).toBeNull();
  });

  it.each([
    { id: "../", type: "vault-import", input_s3_key: OLD_UPLOAD },
    { id: OLD_JOB_ID, type: "vault-import", input_s3_key: `vault-uploads/${OTHER_USER_ID}/old.zip` },
    { id: OLD_JOB_ID, type: "vault-import", input_s3_key: `vault-uploads/${USER_ID}-other/old.zip` },
  ])("rejects an invalid job scope before queueing: $input_s3_key, $id", async (job) => {
    await expect(queueVaultStorageCleanup(USER_ID, [job])).rejects.toThrow(
      "Refusing to queue an invalid vault cleanup scope",
    );
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.getStorageProvider).not.toHaveBeenCalled();
    expect(mocks.deleteChunkVectors).not.toHaveBeenCalled();
  });
});
