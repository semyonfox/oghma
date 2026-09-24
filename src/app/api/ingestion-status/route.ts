// ingestion-status API route
// returns the extraction status for a given note so the frontend can poll
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/utils/uuid";
import sql from "@/database/pgsql";

interface ExtractedNoteRow {
  note_id: string;
  title: string;
  folder_id: string | null;
}

interface IngestionJobRow {
  status: string;
  chunks_stored: number | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CanvasImportRow {
  status: string;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await validateSession();
  if (!session) return tracedError("Unauthorized", 401);

  const noteId = request.nextUrl.searchParams.get("noteId");
  if (!noteId || !isValidUUID(noteId))
    return tracedError("Invalid noteId", 400);

  const [job] = await sql<IngestionJobRow[]>`
    SELECT status, chunks_stored, created_at, updated_at
    FROM app.ingestion_jobs
    WHERE note_id = ${noteId}::uuid
      AND user_id = ${session.user_id}::uuid
    ORDER BY created_at DESC
    LIMIT 1
  `;

  let status = job?.status ?? "none";
  if (!job) {
    const [canvasImport] = await sql<CanvasImportRow[]>`
      SELECT status
      FROM app.canvas_imports
      WHERE note_id = ${noteId}::uuid
        AND user_id = ${session.user_id}::uuid
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    status = canvasImport
      ? canvasImport.status === "complete"
        ? "done"
        : ["error", "forbidden", "cancelled"].includes(canvasImport.status)
          ? "failed"
          : "processing"
      : "none";
  }

  // The current import must finish before a prior extracted note is shown as
  // ready. Historical pairs have no source ID, so only accept unique siblings.
  const [extractedNote] = await sql<ExtractedNoteRow[]>`
    SELECT extracted.note_id, extracted.title, source_tree.parent_id AS folder_id
    FROM app.notes AS source
    JOIN app.tree_items AS source_tree
      ON source_tree.note_id = source.note_id
      AND source_tree.user_id = source.user_id
    JOIN app.tree_items AS extracted_tree
      ON extracted_tree.user_id = source.user_id
      AND extracted_tree.parent_id IS NOT DISTINCT FROM source_tree.parent_id
    JOIN app.notes AS extracted
      ON extracted.note_id = extracted_tree.note_id
      AND extracted.user_id = source.user_id
    WHERE source.note_id = ${noteId}::uuid
      AND source.user_id = ${session.user_id}::uuid
      AND source.deleted_at IS NULL
      AND RIGHT(LOWER(source.title), 4) = '.pdf'
      AND extracted.title = LEFT(source.title, LENGTH(source.title) - 4) || '.md'
      AND extracted.deleted_at IS NULL
      AND extracted.s3_key IS NULL
      AND extracted.extraction_coverage IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM app.notes AS other_pdf
        JOIN app.tree_items AS other_tree
          ON other_tree.note_id = other_pdf.note_id
          AND other_tree.user_id = other_pdf.user_id
        WHERE other_pdf.user_id = source.user_id
          AND other_pdf.note_id <> source.note_id
          AND other_pdf.title = source.title
          AND other_pdf.deleted_at IS NULL
          AND other_tree.parent_id IS NOT DISTINCT FROM source_tree.parent_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM app.notes AS other_extracted
        JOIN app.tree_items AS other_tree
          ON other_tree.note_id = other_extracted.note_id
          AND other_tree.user_id = other_extracted.user_id
        WHERE other_extracted.user_id = source.user_id
          AND other_extracted.note_id <> extracted.note_id
          AND other_extracted.title = extracted.title
          AND other_extracted.deleted_at IS NULL
          AND other_tree.parent_id IS NOT DISTINCT FROM source_tree.parent_id
      )
    LIMIT 1
  `;
  const readyNote = status === "done" || status === "none" ? extractedNote : null;

  return NextResponse.json({
    status: status === "none" && readyNote ? "done" : status,
    extractedNote: readyNote
      ? { id: readyNote.note_id, title: readyNote.title }
      : null,
    folderId: readyNote?.folder_id ?? null,
    chunksStored: job?.chunks_stored ?? 0,
    createdAt: job?.created_at ?? null,
    updatedAt: job?.updated_at ?? null,
  });
});
