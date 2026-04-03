// trash API route - restore and permanently delete soft-deleted notes
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/utils/uuid";
import { getStorageProvider } from "@/lib/storage/init";
import { withErrorHandler, tracedError, requireAuth } from "@/lib/api-error";
import sql from "@/database/pgsql";
import { addNoteToTree } from "@/lib/notes/storage/pg-tree.js";
import logger from "@/lib/logger";

async function fetchTrashItems(userId: string) {
  const rows = await sql`
        SELECT note_id, title, content, is_folder, deleted_at, created_at, updated_at
        FROM app.notes
        WHERE user_id = ${userId}::uuid AND deleted = 1
        ORDER BY deleted_at DESC
    `;
  return rows.map(
    (note: {
      note_id: string;
      title: string;
      content: string;
      is_folder: boolean;
      deleted_at: string | null;
      created_at: string | null;
      updated_at: string | null;
    }) => ({
      id: note.note_id,
      title: note.title,
      content: note.content,
      isFolder: note.is_folder,
      deletedAt: note.deleted_at
        ? new Date(note.deleted_at).toISOString()
        : null,
      createdAt: note.created_at
        ? new Date(note.created_at).toISOString()
        : undefined,
      updatedAt: note.updated_at
        ? new Date(note.updated_at).toISOString()
        : undefined,
    }),
  );
}

async function requireNoteInTrash(
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await sql`
        SELECT note_id FROM app.notes
        WHERE note_id = ${id}::uuid AND user_id = ${userId}::uuid AND deleted = 1
    `;
  return rows.length > 0;
}

export const GET = withErrorHandler(async () => {
  const user = await requireAuth();
  const items = await fetchTrashItems(user.user_id);
  return NextResponse.json({ items });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await requireAuth();

  const body: { action: string; data?: { id?: string } } = await request.json();
  if (!body.action) return tracedError("Missing action", 400);

  const id = body.data?.id;

  if (body.action === "list") {
    const items = await fetchTrashItems(user.user_id);
    return NextResponse.json({ items });
  }

  if (!id || !isValidUUID(id))
    return tracedError("Missing or invalid note id", 400);

  const exists = await requireNoteInTrash(user.user_id, id);
  if (!exists) return tracedError("Note not found in trash", 404);

  if (body.action === "restore") {
    await sql`
            UPDATE app.notes
            SET deleted = 0, deleted_at = NULL, updated_at = NOW()
            WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid
        `;
    await addNoteToTree(user.user_id, id, null);
    return NextResponse.json({ success: true });
  }

  if (body.action === "delete") {
    // clean S3 objects before removing DB rows (best-effort)
    const storage = getStorageProvider();
    const s3Rows = await sql`
            SELECT s3_key FROM app.notes WHERE note_id = ${id}::uuid AND s3_key IS NOT NULL
            UNION ALL
            SELECT s3_key FROM app.attachments WHERE note_id = ${id}::uuid AND s3_key IS NOT NULL
        `;
    await Promise.all(
      s3Rows.map(async (r: { s3_key: string }) => {
        try {
          await storage.deleteObject(r.s3_key);
        } catch (err) {
          logger.warn("S3 delete failed", { key: r.s3_key, err });
        }
      }),
    );

    // clean up embeddings and chunks for this note
    await sql`DELETE FROM app.embeddings WHERE chunk_id IN (SELECT id FROM app.chunks WHERE document_id = ${id}::uuid)`;
    await sql`DELETE FROM app.chunks WHERE document_id = ${id}::uuid`;

    await sql`DELETE FROM app.pdf_annotations WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid`;
    await sql`DELETE FROM app.attachments WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid`;
    await sql`DELETE FROM app.notes WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid`;
    return NextResponse.json({ success: true });
  }

  return tracedError(`Unknown action: ${body.action}`, 400);
});
