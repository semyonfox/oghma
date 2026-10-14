import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import { permanentlyDeleteNotes } from "@/lib/notes/storage/note-lifecycle";
import {
  getSettingsFromS3,
  settingsObjectKey,
} from "@/lib/notes/storage/s3-storage";
import { getStorageProvider } from "@/lib/storage/init";

// the delete-account route promises permanent removal after this many days
export const DELETED_ACCOUNT_GRACE_DAYS = 30;
const PURGE_BATCH_SIZE = 25;

type UserIdRow = { user_id: string };
type NoteIdRow = { note_id: string };

// permanently removes accounts whose grace period has passed. notes go through
// the lifecycle path first so object storage and vectors are cleaned up, then
// the login row is deleted and every other table cascades from it
export async function purgeDeletedAccounts(): Promise<number> {
  const expired = await sql<UserIdRow[]>`
    SELECT user_id FROM app.login
    WHERE deleted_at IS NOT NULL
      AND deleted_at < NOW() - (${DELETED_ACCOUNT_GRACE_DAYS} * INTERVAL '1 day')
    ORDER BY deleted_at
    LIMIT ${PURGE_BATCH_SIZE}
  `;

  let purged = 0;
  for (const { user_id: userId } of expired) {
    try {
      const notes = await sql<NoteIdRow[]>`
        SELECT note_id FROM app.notes WHERE user_id = ${userId}::uuid
      `;
      if (notes.length > 0) {
        await permanentlyDeleteNotes(
          userId,
          notes.map((row) => row.note_id),
        );
      }
      await deleteUserObjects(userId);
      await sql`
        DELETE FROM app.login
        WHERE user_id = ${userId}::uuid AND deleted_at IS NOT NULL
      `;
      purged += 1;
    } catch (error) {
      // the row stays for the next daily pass
      logger.error("account purge failed", { userId, error });
    }
  }
  return purged;
}

// settings and the avatar are the only per-user objects outside the note tree
async function deleteUserObjects(userId: string): Promise<void> {
  const storage = getStorageProvider();
  const { avatarKey } = await getSettingsFromS3(userId);
  if (avatarKey) await storage.deleteObject(avatarKey);
  await storage.deleteObject(settingsObjectKey(userId));
}
