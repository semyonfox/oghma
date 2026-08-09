import { permanentlyDeleteNotes } from "@/lib/notes/storage/note-lifecycle";

/**
 * Legacy compatibility wrapper.
 *
 * Permanent deletion now has to remove all relational dependencies and retain
 * an external-cleanup retry record, so callers should prefer the lifecycle
 * service directly. This wrapper deliberately removes the note too; calling
 * it as a prelude to a second SQL DELETE is no longer correct.
 */
export async function cleanupNoteDependencies(
  userId: string,
  noteId: string,
): Promise<void> {
  await permanentlyDeleteNotes(userId, [noteId]);
}
