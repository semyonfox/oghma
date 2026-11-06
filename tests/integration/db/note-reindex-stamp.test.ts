import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { requireE2EDatabaseUrl } from "../helpers/env";

vi.mock("@/lib/rag/indexing", () => ({
  replaceNoteEmbeddings: vi.fn().mockResolvedValue(1),
}));
vi.mock("@/lib/queue", () => ({
  enqueueNoteReindexJob: vi.fn().mockResolvedValue(undefined),
}));

import sql from "@/database/pgsql";
import { enqueueNoteReindexJob } from "@/lib/queue";
import { reindexNote } from "@/lib/rag/note-reindex";

const fixture = postgres(requireE2EDatabaseUrl(), { max: 1 });
const userId = randomUUID();
const noteId = randomUUID();

beforeAll(async () => {
  await fixture`
    INSERT INTO app.login (user_id, email, hashed_password, email_verified, is_active)
    VALUES (${userId}::uuid, ${`note-reindex-${userId}@example.test`}, 'unused', true, true)
  `;
  // a stamp with sub-millisecond digits, like every NOW() written by a save
  await fixture`
    INSERT INTO app.notes (note_id, user_id, title, content, is_folder, updated_at)
    VALUES (${noteId}::uuid, ${userId}::uuid, 'Reindex', '# Title\n\nBody worth indexing.', false,
      '2026-11-06 00:04:00.819954+00')
  `;
});

afterAll(async () => {
  await fixture`DELETE FROM app.login WHERE user_id = ${userId}::uuid`;
  await Promise.all([fixture.end(), sql.end()]);
});

describe("note reindex stamp", () => {
  it("stamps an unchanged note whose updated_at has microseconds", async () => {
    await expect(reindexNote(noteId, userId)).resolves.toBe("indexed");
    expect(enqueueNoteReindexJob).not.toHaveBeenCalled();

    const [row] = await fixture<{ extracted_text: string | null }[]>`
      SELECT extracted_text FROM app.notes WHERE note_id = ${noteId}::uuid
    `;
    expect(row.extracted_text).toContain("Body worth indexing.");
  });
});
