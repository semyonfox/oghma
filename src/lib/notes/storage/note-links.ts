import sql from "@/database/pgsql.js";
import { extractInternalNoteIds } from "@/lib/notes/internal-links";
import type postgres from "postgres";

export async function replaceNoteLinks(
  userId: string,
  sourceNoteId: string,
  content: string,
) {
  const targetIds = extractInternalNoteIds(content).filter(
    (targetId) => targetId !== sourceNoteId.toLowerCase(),
  );

  await sql.begin(async (transaction: postgres.TransactionSql) => {
    await transaction`
      DELETE FROM app.note_links
      WHERE user_id = ${userId}::uuid
        AND source_note_id = ${sourceNoteId}::uuid
    `;

    for (const targetId of targetIds) {
      await transaction`
        INSERT INTO app.note_links (user_id, source_note_id, target_note_id)
        SELECT ${userId}::uuid, ${sourceNoteId}::uuid, target.note_id
        FROM app.notes target
        WHERE target.note_id = ${targetId}::uuid
          AND target.user_id = ${userId}::uuid
          AND target.deleted_at IS NULL
        ON CONFLICT DO NOTHING
      `;
    }
  });
}
