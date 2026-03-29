import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth.js";
import { isValidUUID } from "@/lib/uuid-validation.js";
import { removeNoteFromTree } from "@/lib/notes/storage/pg-tree.js";
import { deleteNoteAnnotations } from "@/lib/notes/storage/pdf-annotations.js";
import { filterNoteFields } from "@/lib/notes/utils/filter-fields";
import { mapNoteFromDB } from "@/lib/notes/utils/map-note";
import { cacheGet, cacheSet, cacheInvalidate, cacheKeys } from "@/lib/cache";
import sql from "@/database/pgsql.js";
import logger from "@/lib/logger";
import { chunkText } from "@/lib/chunking";
import { embedChunks } from "@/lib/embeddings";
import { processExtractedText } from "@/lib/canvas/text-processing.js";
import { noteUpdateSchema, validateBody } from "@/lib/validations/schemas";

const MAX_TITLE_LENGTH = parseInt(process.env.MAX_TITLE_LENGTH ?? "500", 10);
const MAX_CONTENT_LENGTH = parseInt(
  process.env.MAX_CONTENT_LENGTH ?? String(5 * 1024 * 1024),
  10,
);

export async function GET(request, { params }) {
  try {
    // Get authenticated user
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const noteId = id;

    if (!isValidUUID(noteId)) {
      return NextResponse.json({ error: "Invalid note ID" }, { status: 400 });
    }

    // Parse fields from query parameters
    const url = new URL(request.url);
    const fieldsParam = url.searchParams.get("fields");
    const fields = fieldsParam
      ? fieldsParam.split(",").map((f) => f.trim())
      : undefined;

    // check cache for full note (filter fields after)
    const key = cacheKeys.note(user.user_id, noteId);
    const cached = await cacheGet(key);
    if (cached) {
      return NextResponse.json(filterNoteFields(cached, fields));
    }

    // Get note from PostgreSQL (verify ownership)
    const result = await sql`
       SELECT note_id, title, content, is_folder, s3_key, deleted, shared, pinned, created_at, updated_at FROM app.notes
       WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid AND deleted = 0 AND deleted_at IS NULL
     `;

    const dbNote = result[0];
    if (!dbNote) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Map to NoteModel format and cache full note
    const note = mapNoteFromDB(dbNote);
    await cacheSet(key, note, 600);

    return NextResponse.json(filterNoteFields(note, fields));
  } catch (error) {
    logger.error("note GET error", { error });
    return NextResponse.json(
      { error: "Failed to fetch note" },
      { status: 500 },
    );
  }
}

export async function PUT(request, { params }) {
  try {
    // Get authenticated user
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const noteId = id;

    if (!isValidUUID(noteId)) {
      return NextResponse.json({ error: "Invalid note ID" }, { status: 400 });
    }

    const rawBody = await request.json();

    // validate input shape
    const bodyValidation = validateBody(noteUpdateSchema, rawBody);
    if (!bodyValidation.success) return bodyValidation.response;
    const body = bodyValidation.data;

    // validate input lengths
    if (body.title && body.title.length > MAX_TITLE_LENGTH) {
      logger.warn("note title exceeds max length", {
        length: body.title.length,
        noteId,
      });
      return NextResponse.json(
        { error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer` },
        { status: 400 },
      );
    }
    if (body.content && body.content.length > MAX_CONTENT_LENGTH) {
      logger.warn("note content exceeds max length", {
        length: body.content.length,
        noteId,
      });
      return NextResponse.json(
        { error: `Content must be ${MAX_CONTENT_LENGTH} bytes or fewer` },
        { status: 400 },
      );
    }

    // Get existing note (verify ownership, fetch only fields needed for comparison)
    const result = await sql`
      SELECT note_id, title, content, extracted_text FROM app.notes
      WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid AND deleted = 0 AND deleted_at IS NULL
    `;

    const existingNote = result[0];
    if (!existingNote) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Update note
    const updatedNote = await sql`
       UPDATE app.notes
       SET title = ${body.title || existingNote.title},
           content = ${body.content || existingNote.content},
           updated_at = NOW()
       WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid
       RETURNING note_id, title, content, is_folder, s3_key, deleted, shared, pinned, created_at, updated_at
     `;

    // invalidate cached note; if title changed, tree + list caches too
    const keysToInvalidate = [cacheKeys.note(user.user_id, noteId)];
    if (body.title && body.title !== existingNote.title) {
      keysToInvalidate.push(
        cacheKeys.treeFull(user.user_id),
        cacheKeys.notesList(user.user_id, 0, undefined),
      );
    }
    await cacheInvalidate(...keysToInvalidate);

    // re-embed when meaningful content changes (keeps RAG index fresh)
    if (body.content && body.content !== existingNote.content) {
      const cleanedText = processExtractedText(body.content);
      // only hit Cohere when the semantic content actually changed
      if (cleanedText !== (existingNote.extracted_text ?? "")) {
        try {
          await sql`DELETE FROM app.chunks WHERE document_id = ${noteId}::uuid`;
          await sql`UPDATE app.notes SET extracted_text = ${cleanedText} WHERE note_id = ${noteId}::uuid`;

          const chunks = chunkText(body.content);
          const embeddings = await embedChunks(chunks);
          if (embeddings.length > 0) {
            const chunkRows = await sql`
               INSERT INTO app.chunks (document_id, user_id, text)
               SELECT * FROM UNNEST(
                 ${embeddings.map(() => noteId)}::uuid[],
                 ${embeddings.map(() => user.user_id)}::uuid[],
                 ${embeddings.map((e) => e.chunk)}::text[]
               ) RETURNING id
             `;
            await sql`
               INSERT INTO app.embeddings (chunk_id, embedding)
               SELECT * FROM UNNEST(
                 ${chunkRows.map((r) => r.id)}::uuid[],
                 ${embeddings.map((e) => JSON.stringify(e.vector))}::vector[]
               )
             `;
          }
        } catch (embedErr) {
          logger.error("note embed error", { noteId, error: embedErr });
          // save still succeeded — don't fail the PUT over a RAG issue
        }
      }
    }

    const dbNote = updatedNote[0];
    return NextResponse.json(mapNoteFromDB(dbNote));
  } catch (error) {
    logger.error("note PUT error", { error });
    return NextResponse.json(
      { error: "Failed to update note" },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    // Get authenticated user
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const noteId = id;

    if (!isValidUUID(noteId)) {
      return NextResponse.json({ error: "Invalid note ID" }, { status: 400 });
    }

    // Verify ownership and note exists
    const result = await sql`
      SELECT note_id FROM app.notes
      WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid AND deleted = 0 AND deleted_at IS NULL
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // look up parent before removing from tree (for cache invalidation)
    const parentRow = await sql`
      SELECT parent_id FROM app.tree_items
      WHERE user_id = ${user.user_id}::uuid AND note_id = ${noteId}::uuid
    `;
    const parentId = parentRow[0]?.parent_id || null;

    // Soft delete note (set deleted flag and timestamp)
    await sql`
      UPDATE app.notes
      SET deleted = 1, deleted_at = NOW()
      WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid
    `;

    // Remove from tree
    await removeNoteFromTree(user.user_id, noteId);

    // Delete all annotations for this note
    await deleteNoteAnnotations(user.user_id, noteId);

    // invalidate note + tree + list caches
    await cacheInvalidate(
      cacheKeys.note(user.user_id, noteId),
      cacheKeys.treeChildren(user.user_id, parentId),
      cacheKeys.treeFull(user.user_id),
      cacheKeys.notesList(user.user_id, 0, undefined),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("note DELETE error", { error });
    return NextResponse.json(
      { error: "Failed to delete note" },
      { status: 500 },
    );
  }
}
