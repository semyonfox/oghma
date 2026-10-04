import test from "node:test";
import assert from "node:assert/strict";
import { OfflineLibrary, offlineSnapshotSchema } from "./offline-state.ts";

const ownerId = "550e8400-e29b-41d4-a716-446655440000";
const otherOwner = "550e8400-e29b-41d4-a716-446655440001";
const note = {
  id: "550e8400-e29b-41d4-a716-446655440002",
  title: "Test note",
  content: "# Synthetic study notes",
  savedAt: "2026-09-14T12:00:00.000Z",
};

function memoryStorage() {
  let value: string | null = null;
  return {
    read: async () => value,
    write: async (next: string) => {
      value = next;
    },
  };
}

test("downloaded notes survive a cold start without any network or account request", async () => {
  const storage = memoryStorage();
  const library = new OfflineLibrary(storage);
  await library.setAccount(ownerId);
  await library.save({ ownerId, note });
  assert.deepEqual(await new OfflineLibrary(storage).read(), [note]);
  await library.save({ ownerId, note: { ...note, content: "Updated" } });
  assert.equal(library.notes.length, 1);
  assert.equal(library.notes[0].content, "Updated");
});

test("account changes and logout remove downloaded notes from persisted storage", async () => {
  const storage = memoryStorage();
  const library = new OfflineLibrary(storage);
  await library.setAccount(ownerId);
  await library.save({ ownerId, note });
  await library.setAccount(otherOwner);
  assert.deepEqual(await new OfflineLibrary(storage).read(), []);
  await assert.rejects(library.save({ ownerId, note }), /account changed/);
  await library.save({ ownerId: otherOwner, note });
  await library.setAccount(null);
  assert.deepEqual(await new OfflineLibrary(storage).read(), []);
});

test("logout hides notes immediately and wins over an already writing download", async () => {
  const storage = memoryStorage();
  let hold = false;
  let release: () => void = () => {};
  let started: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writing = new Promise<void>((resolve) => {
    started = resolve;
  });
  const library = new OfflineLibrary({
    read: storage.read,
    write: async (value) => {
      if (hold) {
        started();
        await pending;
      }
      await storage.write(value);
    },
  });
  await library.setAccount(ownerId);
  hold = true;
  const save = library.save({ ownerId, note });
  await writing;
  const logout = library.setAccount(null);
  assert.deepEqual(library.notes, []);
  release();
  await Promise.all([save, logout]);
  assert.deepEqual(await new OfflineLibrary(storage).read(), []);
});

test("a queued download cannot resurrect notes after clearing the library", async () => {
  const storage = memoryStorage();
  const library = new OfflineLibrary(storage);
  await library.setAccount(ownerId);
  const save = library.save({ ownerId, note });
  const clear = library.clear();
  await assert.rejects(save, /account changed/);
  await clear;
  assert.deepEqual(await new OfflineLibrary(storage).read(), []);
});

test("a failed storage write is not reported as a saved note", async () => {
  let fail = false;
  const storage = memoryStorage();
  const library = new OfflineLibrary({
    read: storage.read,
    write: async (value) => {
      if (fail) throw new Error("Storage full");
      await storage.write(value);
    },
  });
  await library.setAccount(ownerId);
  fail = true;
  await assert.rejects(library.save({ ownerId, note }), /Storage full/);
  assert.deepEqual(library.notes, []);
});

test("removing a copy persists without needing the online note", async () => {
  const storage = memoryStorage();
  const library = new OfflineLibrary(storage);
  await library.setAccount(ownerId);
  await library.save({ ownerId, note });
  await library.remove(note.id);
  assert.deepEqual(await new OfflineLibrary(storage).read(), []);
});

test("corrupt libraries can be cleared and snapshots reject paths and oversized content", async () => {
  const storage = memoryStorage();
  await storage.write("not JSON");
  const library = new OfflineLibrary(storage);
  await assert.rejects(library.read());
  await library.clear();
  assert.deepEqual(await library.read(), []);
  for (const invalid of [
    { ...note, id: "../../private" },
    { ...note, content: "a".repeat(200_001) },
  ]) {
    assert.equal(
      offlineSnapshotSchema.safeParse({ ownerId, note: invalid }).success,
      false,
    );
  }
});
