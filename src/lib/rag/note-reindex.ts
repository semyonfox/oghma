import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import { chunkText } from "@/lib/rag/chunking";
import { replaceNoteEmbeddings } from "@/lib/rag/indexing";
import { processExtractedText } from "@/lib/canvas/text-processing";
import { enqueueNoteReindexJob } from "@/lib/queue";

interface NoteReindexRow {
  content: string;
  extracted_text: string | null;
  // kept as text so the µs precision survives the round trip into the UPDATE.
  // the parameter must also bind as text: a bare ::timestamptz makes postgres.js
  // serialise it through Date, which drops it to ms and the stamp never matches
  updated_at: string;
}

export type NoteReindexOutcome = "indexed" | "unchanged" | "missing" | "stale";

/**
 * Rebuild a note's search index from its current content. Runs on the worker
 * after a save; the saving request only enqueues it.
 *
 * The job carries no content, so it is safe to run late or more than once.
 * If the note changes while the embeddings are being built, the stamp check
 * fails and the job re-queues itself rather than publishing an index that
 * describes an older body.
 */
export async function reindexNote(
  noteId: string,
  userId: string,
): Promise<NoteReindexOutcome> {
  const startedAt = performance.now();
  const outcome = await runReindex(noteId, userId);
  logger.info("note reindex", {
    noteId,
    outcome,
    ms: Math.round(performance.now() - startedAt),
  });
  return outcome;
}

async function runReindex(
  noteId: string,
  userId: string,
): Promise<NoteReindexOutcome> {
  const [note] = (await sql`
    SELECT content, extracted_text, updated_at::text AS updated_at
    FROM app.notes
    WHERE note_id = ${noteId}::uuid
      AND user_id = ${userId}::uuid
      AND deleted_at IS NULL
      AND is_folder = FALSE
  `) as NoteReindexRow[];
  if (!note) return "missing";

  const cleanedText = processExtractedText(note.content);
  const unchanged = cleanedText === (note.extracted_text ?? "");

  if (!unchanged) await replaceNoteEmbeddings(noteId, userId, chunkText(note.content));

  const stamped = await sql`
    UPDATE app.notes
    SET extracted_text = ${cleanedText}, reindex_requested_at = NULL
    WHERE note_id = ${noteId}::uuid
      AND user_id = ${userId}::uuid
      AND deleted_at IS NULL
      AND updated_at = ${note.updated_at}::text::timestamptz
    RETURNING note_id
  `;
  if (stamped.length > 0) return unchanged ? "unchanged" : "indexed";

  logger.info("note changed during reindex, requeueing", { noteId });
  await enqueueNoteReindexJob(noteId, userId);
  return "stale";
}

// the row marker survives a failed queue publish and is cleared only by a matching job
export async function recoverNoteReindexes(): Promise<void> {
  // re-stamping the claimed rows spaces retries of a note that keeps failing
  // to one per window and lets newer requests reach the front
  const notes = await sql<{ note_id: string; user_id: string }[]>`
    UPDATE app.notes SET reindex_requested_at = NOW()
    WHERE note_id IN (
      SELECT note_id FROM app.notes
      WHERE reindex_requested_at < NOW() - INTERVAL '2 minutes'
        AND deleted_at IS NULL AND is_folder = FALSE
      ORDER BY reindex_requested_at
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    )
    RETURNING note_id, user_id
  `;
  for (const note of notes) {
    try {
      await enqueueNoteReindexJob(note.note_id, note.user_id);
    } catch (error) {
      logger.error("note reindex recovery enqueue failed", { noteId: note.note_id, error });
    }
  }
}
