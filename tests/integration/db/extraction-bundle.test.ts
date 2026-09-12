import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { requireE2EDatabaseUrl } from "../helpers/env";

vi.mock("@/lib/cache", () => ({
  cacheInvalidate: vi.fn().mockResolvedValue(undefined),
  cacheKeys: {
    treeChildren: (userId: string, parentId: string | null) =>
      `tree:${userId}:${parentId ?? "root"}`,
    treeFull: (userId: string) => `tree-full:${userId}`,
    notesList: (userId: string) => `notes:${userId}`,
  },
}));

import appSql from "@/database/pgsql";
import { moveNoteToExtractionBundle } from "@/lib/notes/extraction-bundle";

const fixtureSql = postgres(requireE2EDatabaseUrl(), { max: 1 });

afterAll(async () => {
  await Promise.all([fixtureSql.end(), appSql.end()]);
});

describe("PDF extraction bundles", () => {
  it("locks a root source row, reparents it, and reuses its bundle", async () => {
    const userId = randomUUID();
    const sourceNoteId = randomUUID();

    try {
      await fixtureSql`
        INSERT INTO app.login (
          user_id, email, hashed_password, email_verified, display_name, is_active
        ) VALUES (
          ${userId}::uuid,
          ${`pdf-bundle-${userId}@example.test`},
          'unused',
          true,
          'PDF Bundle Test',
          true
        )
      `;
      await fixtureSql`
        INSERT INTO app.notes (note_id, user_id, title, content, is_folder)
        VALUES (
          ${sourceNoteId}::uuid,
          ${userId}::uuid,
          'Lecture 03.pdf',
          '',
          false
        )
      `;
      await fixtureSql`
        INSERT INTO app.tree_items (user_id, note_id, parent_id)
        VALUES (${userId}::uuid, ${sourceNoteId}::uuid, NULL)
      `;

      const bundleId = await moveNoteToExtractionBundle(
        userId,
        sourceNoteId,
        "Lecture 03.pdf",
      );

      const [treeRow] = await fixtureSql`
        SELECT parent_id
        FROM app.tree_items
        WHERE user_id = ${userId}::uuid AND note_id = ${sourceNoteId}::uuid
      `;
      const bundles = await fixtureSql`
        SELECT note.note_id, tree.parent_id
        FROM app.notes AS note
        JOIN app.tree_items AS tree
          ON tree.user_id = note.user_id AND tree.note_id = note.note_id
        WHERE note.user_id = ${userId}::uuid
          AND note.title = 'Lecture 03'
          AND note.is_folder = true
          AND note.deleted_at IS NULL
      `;

      expect(String(treeRow?.parent_id)).toBe(bundleId);
      expect(bundles).toHaveLength(1);
      expect(String(bundles[0]?.note_id)).toBe(bundleId);
      expect(bundles[0]?.parent_id).toBeNull();

      await expect(
        moveNoteToExtractionBundle(userId, sourceNoteId, "Lecture 03.pdf"),
      ).resolves.toBe(bundleId);

      const [{ count }] = await fixtureSql`
        SELECT COUNT(*)::int AS count
        FROM app.notes
        WHERE user_id = ${userId}::uuid
          AND title = 'Lecture 03'
          AND is_folder = true
          AND deleted_at IS NULL
      `;
      expect(count).toBe(1);
    } finally {
      await fixtureSql`
        DELETE FROM app.login WHERE user_id = ${userId}::uuid
      `;
    }
  });
});
