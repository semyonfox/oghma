// performs a full, irreversible hard-deletion of a user account
// called by the scheduled cleanup job — NOT by the delete-account endpoint
import sql from "@/database/pgsql.js";
import logger from "@/lib/logger";
import { getStorageProvider } from "@/lib/storage/init";
import { cacheInvalidate, cacheKeys } from "@/lib/cache";

/**
 * Permanently deletes all data for a user: S3 objects, Redis cache, and every
 * DB row belonging to them (in dependency order), then the login row itself.
 *
 * Called by the scheduled cleanup job — NOT by the delete-account endpoint.
 */
export async function performHardAccountDeletion(
  userId: string,
): Promise<void> {
  const storage = getStorageProvider();

  // 1. collect all S3 keys before any DB deletion
  const noteS3Keys = await sql`
    SELECT s3_key FROM app.notes
    WHERE user_id = ${userId}::uuid AND s3_key IS NOT NULL
  `;
  const attachmentS3Keys = await sql`
    SELECT a.s3_key FROM app.attachments a
    JOIN app.notes n ON a.note_id = n.note_id
    WHERE n.user_id = ${userId}::uuid AND a.s3_key IS NOT NULL
  `;
  const jobS3Keys = await sql`
    SELECT input_s3_key AS s3_key FROM app.canvas_import_jobs
    WHERE user_id = ${userId}::uuid AND input_s3_key IS NOT NULL
    UNION ALL
    SELECT output_s3_key AS s3_key FROM app.canvas_import_jobs
    WHERE user_id = ${userId}::uuid AND output_s3_key IS NOT NULL
  `;

  const allS3Keys: string[] = [
    ...noteS3Keys.map((r: { s3_key: string }) => r.s3_key),
    ...attachmentS3Keys.map((r: { s3_key: string }) => r.s3_key),
    ...jobS3Keys.map((r: { s3_key: string }) => r.s3_key),
    `settings/${userId}/settings.json`,
  ];

  // 2. delete S3 objects (best-effort — log failures but don't abort)
  let s3Deleted = 0;
  let s3Failed = 0;
  await Promise.all(
    allS3Keys.map(async (key) => {
      try {
        await storage.deleteObject(key);
        s3Deleted++;
      } catch (err) {
        logger.warn("account-deletion: S3 delete failed", { key, error: err });
        s3Failed++;
      }
    }),
  );

  // 3. invalidate Redis cache for this user
  try {
    await cacheInvalidate(
      cacheKeys.settings(userId),
      cacheKeys.treeFull(userId),
      cacheKeys.treeChildren(userId, null),
    );
  } catch (err) {
    logger.warn("account-deletion: cache invalidation failed", { error: err });
  }

  // 4. hard-delete all user data (leaf tables first to respect FK constraints)

  // quiz reviews reference sessions and cards
  await sql`DELETE FROM app.quiz_reviews WHERE user_id = ${userId}::uuid`;

  // quiz sessions reference user
  await sql`DELETE FROM app.quiz_sessions WHERE user_id = ${userId}::uuid`;

  // quiz cards reference quiz_questions
  await sql`DELETE FROM app.quiz_cards WHERE user_id = ${userId}::uuid`;

  // quiz questions reference notes and chunks
  await sql`DELETE FROM app.quiz_questions WHERE user_id = ${userId}::uuid`;

  // chat messages reference chat_sessions
  await sql`
    DELETE FROM app.chat_messages
    WHERE session_id IN (
      SELECT id FROM app.chat_sessions WHERE user_id = ${userId}::uuid
    )
  `;
  await sql`DELETE FROM app.chat_sessions WHERE user_id = ${userId}::uuid`;

  // user_streaks
  await sql`DELETE FROM app.user_streaks WHERE user_id = ${userId}::uuid`;

  // embeddings reference chunks
  await sql`
    DELETE FROM app.embeddings
    WHERE chunk_id IN (
      SELECT id FROM app.chunks WHERE user_id = ${userId}::uuid
    )
  `;
  await sql`DELETE FROM app.chunks WHERE user_id = ${userId}::uuid`;

  // pdf_annotations reference notes (and user)
  await sql`DELETE FROM app.pdf_annotations WHERE user_id = ${userId}::uuid`;

  // attachments reference notes
  await sql`
    DELETE FROM app.attachments
    WHERE note_id IN (
      SELECT note_id FROM app.notes WHERE user_id = ${userId}::uuid
    )
  `;

  // pomodoro_sessions reference user (and optionally assignments/time_blocks)
  await sql`DELETE FROM app.pomodoro_sessions WHERE user_id = ${userId}::uuid`;

  // time_blocks reference user (and optionally assignments)
  await sql`DELETE FROM app.time_blocks WHERE user_id = ${userId}::uuid`;

  // assignments reference user
  await sql`DELETE FROM app.assignments WHERE user_id = ${userId}::uuid`;

  // tree_items reference user and notes
  await sql`DELETE FROM app.tree_items WHERE user_id = ${userId}::uuid`;

  // canvas_imports and canvas_import_jobs
  await sql`DELETE FROM app.canvas_imports WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM app.canvas_import_jobs WHERE user_id = ${userId}::uuid`;

  // notes themselves
  await sql`DELETE FROM app.notes WHERE user_id = ${userId}::uuid`;

  // oauth_accounts have ON DELETE CASCADE from login, but delete explicitly for clarity
  await sql`DELETE FROM app.oauth_accounts WHERE user_id = ${userId}::uuid`;

  // finally delete the login row — this is the GDPR erasure
  await sql`DELETE FROM app.login WHERE user_id = ${userId}::uuid`;

  logger.info("account-deletion: user permanently deleted", {
    userId,
    s3Deleted,
    s3Failed,
  });
}
