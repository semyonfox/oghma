import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { checkRateLimit } from '@/lib/rateLimiter';
import { isValidUUID } from '@/lib/uuid-validation.js';
import { generateUUID } from '@/lib/utils/uuid';
import { addNoteToTree } from '@/lib/notes/storage/pg-tree.js';
import { getStorageProvider } from '@/lib/storage/init';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';

/**
 * POST /api/notes/:id/share
 * 
 * Clone a note to another user's workspace.
 * Creates an independent copy with cloned_from FK pointing to original.
 * 
 * @param id - Source note UUID
 * @param targetUserId - Target user UUID
 * @param targetParentId - Where to place clone (null = root)
 * @returns Cloned note ID
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const limited = await checkRateLimit('share', user.user_id);
    if (limited) return limited;

    const { id } = await params;
    const sourceNoteId = id;
    if (!isValidUUID(sourceNoteId)) {
      return NextResponse.json(
        { error: 'Invalid note ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { targetUserId, targetParentId } = body;

    if (!targetUserId || !isValidUUID(targetUserId)) {
      return NextResponse.json(
        { error: 'Invalid or missing targetUserId' },
        { status: 400 }
      );
    }

    if (targetParentId && !isValidUUID(targetParentId)) {
      return NextResponse.json(
        { error: 'Invalid targetParentId' },
        { status: 400 }
      );
    }

    // cannot share to yourself
    if (targetUserId === user.user_id) {
      return NextResponse.json(
        { error: 'Cannot share a note with yourself. Use duplicate instead.' },
        { status: 400 }
      );
    }

    // verify target user exists and is active
    const targetUser = await sql`
      SELECT user_id FROM app.login
      WHERE user_id = ${targetUserId}::uuid
        AND is_active = true AND deleted_at IS NULL
    `;
    if (!targetUser.length) {
      return NextResponse.json(
        { error: 'Target user not found' },
        { status: 404 }
      );
    }

    // only the owner can share their own note
    const sourceNote = await sql`
      SELECT note_id, title, content, s3_key, is_folder
      FROM app.notes
      WHERE note_id = ${sourceNoteId}::uuid
        AND user_id = ${user.user_id}::uuid
        AND deleted = 0 AND deleted_at IS NULL
    `;

    if (!sourceNote.length) {
      return NextResponse.json(
        { error: 'Source note not found' },
        { status: 404 }
      );
    }

    const note = sourceNote[0];

    // Generate UUID v7 for clone
    const cloneId = generateUUID();

    // copy S3 object so the clone is independent of the original
    // if the owner later deletes their note, the shared copy survives
    let clonedS3Key: string | null = null;
    if (note.s3_key) {
      try {
        const storage = getStorageProvider();
        const originalContent = await storage.getObject(note.s3_key);
        if (originalContent) {
          const filename = note.s3_key.split('/').pop() ?? 'file';
          clonedS3Key = `notes/${cloneId}/${filename}`;
          await storage.putObject(clonedS3Key, originalContent, {
            contentType: 'application/octet-stream',
          });
        }
      } catch (err) {
        logger.warn('failed to copy S3 object for share, clone will have no file', {
          sourceKey: note.s3_key, error: err,
        });
      }
    }

    // Create clone in target user's notes
    const cloned = await sql`
      INSERT INTO app.notes (
        note_id,
        user_id,
        title,
        content,
        s3_key,
        is_folder,
        cloned_from,
        deleted,
        created_at,
        updated_at
      ) VALUES (
        ${cloneId}::uuid,
        ${targetUserId}::uuid,
        ${note.title + ' (shared)'},
        ${note.content},
        ${clonedS3Key},
        ${note.is_folder},
        ${sourceNoteId}::uuid,
        0,
        NOW(),
        NOW()
      )
      RETURNING note_id
    `;

    // Add clone to target user's tree
    await addNoteToTree(targetUserId, cloned[0].note_id, targetParentId || null);

    return NextResponse.json({
      success: true,
      clonedNoteId: cloned[0].note_id,
      message: 'Note cloned to target user',
    }, { status: 201 });
  } catch (error) {
    logger.error('share note error', { error });
    return NextResponse.json(
      { error: 'Failed to share note' },
      { status: 500 }
    );
  }
}
