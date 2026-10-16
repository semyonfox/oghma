import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import postgres from "postgres";
import { requireE2EDatabaseUrl } from "../helpers/env";

vi.mock("@/lib/auth/session", () => ({ validateSession: vi.fn() }));

import appSql from "@/database/pgsql";
import { validateSession } from "@/lib/auth/session";
import { GET } from "@/app/api/ingestion-status/route";

const fixtureSql = postgres(requireE2EDatabaseUrl(), { max: 1 });

afterAll(async () => {
  await Promise.all([fixtureSql.end(), appSql.end()]);
});

async function createUser(userId: string) {
  await fixtureSql`
    INSERT INTO app.login (
      user_id, email, hashed_password, email_verified, display_name, is_active
    ) VALUES (
      ${userId}::uuid,
      ${`ingestion-status-${userId}@example.test`},
      'unused',
      true,
      'Ingestion Status Test',
      true
    )
  `;
}

async function createNote(
  userId: string,
  noteId: string,
  title: string,
  extractedFromNoteId: string | null = null,
) {
  const extracted = title.endsWith(".md");
  await fixtureSql`
    INSERT INTO app.notes (
      note_id, user_id, title, content, is_folder,
      extracted_from_note_id, extraction_coverage
    ) VALUES (
      ${noteId}::uuid,
      ${userId}::uuid,
      ${title},
      '',
      false,
      ${extractedFromNoteId}::uuid,
      ${extracted ? '{"source":"pdf-parse"}' : null}::text::jsonb
    )
  `;
  await fixtureSql`
    INSERT INTO app.tree_items (user_id, note_id, parent_id)
    VALUES (${userId}::uuid, ${noteId}::uuid, NULL)
  `;
}

async function status(noteId: string) {
  const response = await GET(
    new NextRequest(`http://localhost/api/ingestion-status?noteId=${noteId}`),
  );
  return response.json();
}

describe("ingestion status companion lookup", () => {
  let userId: string;

  beforeEach(() => {
    userId = randomUUID();
    vi.mocked(validateSession).mockResolvedValue({
      user_id: userId,
      session_version: 0,
      email: `ingestion-status-${userId}@example.test`,
    });
  });

  it("follows the recorded source link after the companion is renamed", async () => {
    const sourceId = randomUUID();
    const companionId = randomUUID();
    try {
      await createUser(userId);
      await createNote(userId, sourceId, "Lecture 04.pdf");
      await createNote(userId, companionId, "My week 4 notes.md", sourceId);

      const body = await status(sourceId);

      expect(body.status).toBe("done");
      expect(body.extractedNote).toEqual({
        id: companionId,
        title: "My week 4 notes.md",
      });
    } finally {
      await fixtureSql`DELETE FROM app.login WHERE user_id = ${userId}::uuid`;
    }
  });

  it("still finds an unlinked historical companion by its sibling title", async () => {
    const sourceId = randomUUID();
    const companionId = randomUUID();
    try {
      await createUser(userId);
      await createNote(userId, sourceId, "Lecture 05.pdf");
      await createNote(userId, companionId, "Lecture 05.md");

      const body = await status(sourceId);

      expect(body.extractedNote).toEqual({ id: companionId, title: "Lecture 05.md" });
    } finally {
      await fixtureSql`DELETE FROM app.login WHERE user_id = ${userId}::uuid`;
    }
  });

  it("does not borrow a same-titled companion that belongs to another PDF", async () => {
    const sourceId = randomUUID();
    const otherSourceId = randomUUID();
    try {
      await createUser(userId);
      await createNote(userId, sourceId, "Lecture 06.pdf");
      await createNote(userId, otherSourceId, "Other.pdf");
      await createNote(userId, randomUUID(), "Lecture 06.md", otherSourceId);

      const body = await status(sourceId);

      expect(body.extractedNote).toBeNull();
    } finally {
      await fixtureSql`DELETE FROM app.login WHERE user_id = ${userId}::uuid`;
    }
  });
});
