import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { getStorageProvider } from '@/lib/storage/init';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';

/**
 * DELETE /api/vault
 *
 * Wipes all user data from both Postgres and S3:
 *   - Deletes every S3 object referenced by the user's notes (s3_key column)
 *   - Deletes all rows from app.notes, app.tree_items, app.canvas_imports,
 *     app.canvas_import_jobs, and app.pdf_annotations for this user
 *
 * Intentionally does NOT delete the user's login row (credentials / Canvas token)
 * so they remain authenticated and can re-import immediately.
 *
 * Returns a summary of what was deleted.
 */
export async function DELETE() {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.user_id;
    const storage = getStorageProvider();

    // ── 1. Collect all S3 keys for this user ────────────────────────────────
    const s3Rows = await sql`
      SELECT s3_key FROM app.notes
      WHERE user_id = ${userId}::uuid
        AND s3_key IS NOT NULL
    `;

    const s3Keys: string[] = s3Rows.map((r: { s3_key: string }) => r.s3_key);

    // ── 2. Delete from S3 (best-effort — log failures but don't abort) ───────
    let s3Deleted = 0;
    let s3Failed = 0;

    await Promise.all(
      s3Keys.map(async (key) => {
        try {
          await storage.deleteObject(key);
          s3Deleted++;
        } catch (err) {
          logger.error('failed to delete S3 object', { key, error: err });
          s3Failed++;
        }
      })
    );

    // ── 3. Wipe Postgres rows ────────────────────────────────────────────────
    // Order matters: delete children before parents to avoid FK violations

    // PDF annotations reference notes
    const annotationsResult = await sql`
      DELETE FROM app.pdf_annotations
      WHERE note_id IN (
        SELECT note_id FROM app.notes WHERE user_id = ${userId}::uuid
      )
      RETURNING note_id
    `;

    // Tree items reference notes
    const treeResult = await sql`
      DELETE FROM app.tree_items
      WHERE user_id = ${userId}::uuid
      RETURNING note_id
    `;

    // Canvas import records
    const importsResult = await sql`
      DELETE FROM app.canvas_imports
      WHERE user_id = ${userId}::uuid
      RETURNING id
    `;

    // Canvas import jobs
    const jobsResult = await sql`
      DELETE FROM app.canvas_import_jobs
      WHERE user_id = ${userId}::uuid
      RETURNING id
    `;

    // Notes themselves (including folders)
    const notesResult = await sql`
      DELETE FROM app.notes
      WHERE user_id = ${userId}::uuid
      RETURNING note_id
    `;

    return NextResponse.json({
      success: true,
      summary: {
        s3FilesDeleted: s3Deleted,
        s3FilesFailed: s3Failed,
        notesDeleted: notesResult.length,
        treeItemsDeleted: treeResult.length,
        canvasImportsDeleted: importsResult.length,
        canvasJobsDeleted: jobsResult.length,
        annotationsDeleted: annotationsResult.length,
      },
    });

  } catch (err) {
    logger.error('vault delete error', { error: err });
    return NextResponse.json({ error: 'Failed to delete vault' }, { status: 500 });
  }
}
