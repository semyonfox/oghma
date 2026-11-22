import sql from "@/database/pgsql";
import { extractInternalNoteIds } from "@/lib/notes/internal-links";

export async function replaceNoteLinks(
  userId: string,
  sourceNoteId: string,
) {
  await sql.begin(async (transaction) => {
    // serialize rebuilds without blocking the foreign key checks for incoming links
    const [source] = await transaction<{ content: string | null }[]>`
      SELECT content FROM app.notes
      WHERE user_id = ${userId}::uuid
        AND note_id = ${sourceNoteId}::uuid
        AND deleted_at IS NULL
      FOR NO KEY UPDATE
    `;
    if (!source) return;

    const targetIds = extractInternalNoteIds(source.content ?? "").filter(
      (targetId) => targetId !== sourceNoteId.toLowerCase(),
    );
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
