import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { CanvasClient } from '@/lib/canvas/client.js';
import { processExtractedText } from '@/lib/canvas/text-processing.js';
import { chunkText } from '@/lib/chunking.ts';
import { embedChunks } from '@/lib/embeddings.ts';
import { getStorageProvider } from '@/lib/storage/init.ts';
import { addNoteToTree } from '@/lib/notes/storage/pg-tree.js';
import sql from '@/database/pgsql.js';

/**
 * MIME types we can currently process through the RAG pipeline.
 * PDFs are handled via pdf-parse.
 * Extend this set as support for other formats is added (e.g. DOCX).
 */
const PROCESSABLE_TYPES = new Set([
  'application/pdf',
]);

/**
 * POST /api/canvas/import
 *
 * Triggers a full Canvas import for the courses the user selected.
 * For each course:
 *   1. Fetches modules and file items from Canvas
 *   2. Downloads each file (skipping any that return 403)
 *   3. Uploads the file to S3 under canvas/{userId}/{courseId}/{moduleId}/{filename}
 *   4. Creates a note in app.notes
 *   5. Adds the note to the root of the user's file tree
 *   6. Runs the file through the RAG pipeline:
 *      pdf-parse → clean text → chunk → embed → store
 *
 * 403 responses from Canvas (lecturer restricted the file) are recorded in canvas_imports with status 'forbidden' so the UI can show the user exactly which
 * files they need to upload manually.
 *
 * TODO: Move the processing loop to a background queue (e.g. BullMQ) once imports grow large enough to risk hitting Amplify's function timeout.
 *
 * Body: { courseIds: string[] }
 */
export async function POST(request) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { courseIds } = await request.json();

    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return NextResponse.json({ error: 'courseIds array is required' }, { status: 400 });
    }

    // Retrieve stored Canvas credentials for this user
    const rows = await sql`
      SELECT canvas_token, canvas_domain
      FROM app.login
      WHERE user_id = ${user.user_id}
    `;

    const { canvas_token, canvas_domain } = rows[0] ?? {};

    if (!canvas_token || !canvas_domain) {
      return NextResponse.json({ error: 'No Canvas account connected' }, { status: 400 });
    }

    const client = new CanvasClient(canvas_domain, canvas_token);
    const storage = getStorageProvider();

    // Track counts across all courses to return a summary to the frontend
    let imported = 0;
    let forbidden = 0;
    let failed = 0;
    let skipped = 0;

    for (const courseId of courseIds) {
      // Fetch all modules in this course
      const { data: modules, forbidden: modulesForbidden } = await client.getModules(courseId);

      if (modulesForbidden || !modules) {
        // The entire course is restricted — skip and move on
        console.warn(`Course ${courseId} modules are restricted`);
        continue;
      }

      for (const module of modules) {
        // Fetch individual items inside this module
        const { data: items } = await client.getModuleItems(courseId, module.id);
        if (!items) continue;

        // Canvas module items can be many types (Page, Assignment, Quiz, etc.)
        // We only want File items for import
        const fileItems = items.filter(item => item.type === 'File');

        for (const item of fileItems) {
          // Get full file metadata — includes download URL and MIME type
          const { data: file, forbidden: fileForbidden, error: fileError } = await client.getFile(courseId, item.content_id);

          if (fileForbidden || !file) {
            // Lecturer has restricted this file — log it for manual upload
            await sql`
              INSERT INTO app.canvas_imports
                (user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, status, error_message)
              VALUES
                (${user.user_id}, ${courseId}, ${module.id}, ${item.content_id},
                 ${item.title}, 'forbidden', ${fileError ?? 'Access restricted by lecturer'})
            `;
            forbidden++;
            continue;
          }

          // Skip file types we don't yet have a processor for (videos, zips, etc.)
          if (!PROCESSABLE_TYPES.has(file.content_type)) {
            skipped++;
            continue;
          }

          // Create the import record immediately so status polling can track it
          const importRecord = await sql`
            INSERT INTO app.canvas_imports
              (user_id, canvas_course_id, canvas_module_id, canvas_file_id,
               filename, mime_type, status)
            VALUES
              (${user.user_id}, ${courseId}, ${module.id}, ${file.id},
               ${file.display_name}, ${file.content_type}, 'downloading')
            RETURNING id
          `;

          const importId = importRecord[0].id;

          // Download the file binary from Canvas
          const { buffer, forbidden: downloadForbidden, error: downloadError } = await client.downloadFile(file.url);

          if (downloadForbidden || !buffer) {
            await sql`
              UPDATE app.canvas_imports
              SET status = 'forbidden', error_message = ${downloadError ?? 'Download restricted'}, updated_at = NOW()
              WHERE id = ${importId}
            `;
            forbidden++;
            continue;
          }

          try {
            // Update status to show we've moved past download and into processing
            await sql`
              UPDATE app.canvas_imports SET status = 'processing', updated_at = NOW()
              WHERE id = ${importId}
            `;

            // Store under a predictable path organised by course and module.
            // When the file tree supports directories, this path mirrors the
            // folder structure that should be created.
            const s3Key = `canvas/${user.user_id}/${courseId}/${module.id}/${file.filename}`;
            await storage.putObject(s3Key, buffer);

            // Create the note — title is the Canvas filename, content starts empty
            const noteResult = await sql`
              INSERT INTO app.notes (user_id, title, content, s3_key, deleted, created_at, updated_at)
              VALUES (${user.user_id}, ${file.display_name}, '', ${s3Key}, 0, NOW(), NOW())
              RETURNING note_id
            `;

            const noteId = noteResult[0].note_id;

            // Add to root of the user's file tree.
            // TODO: once directory support is added to the file tree, create a folder
            // per module and pass its tree ID here instead of null.
            await addNoteToTree(user.user_id, noteId, null);

            // ── RAG Pipeline ──────────────────────────────────────────────

            // Parse raw text from the PDF buffer
            const pdfParseModule = await import('pdf-parse');
            const pdfParse = pdfParseModule.default ?? pdfParseModule;
            const parsed = await pdfParse(buffer);

            // Clean the extracted text (stop words, noise, normalisation)
            const cleanedText = processExtractedText(parsed.text);

            // Split into overlapping chunks for the embedding model
            const chunks = chunkText(cleanedText);

            // Generate vectors for each chunk via the embedding server
            const embeddings = await embedChunks(chunks);

            // Store the first chunk's vector as the document-level embedding on the note.
            // A dedicated chunks table for full per-chunk RAG retrieval is a
            // TODO once the schema supports it (see embeddings.js).
            const documentVector = embeddings[0]?.vector ?? null;

            // Persist cleaned text and embedding back onto the note
            await sql`
              UPDATE app.notes
              SET extracted_text = ${cleanedText},
                  embedding = ${documentVector ? JSON.stringify(documentVector) : null}::vector,
                  updated_at = NOW()
              WHERE note_id = ${noteId}
            `;

            // ── End RAG Pipeline ──────────────────────────────────────────

            // Mark import as complete and link to the created note
            await sql`
              UPDATE app.canvas_imports
              SET status = 'complete', note_id = ${noteId}, updated_at = NOW()
              WHERE id = ${importId}
            `;

            imported++;

          } catch (processingError) {
            console.error(`Failed to process file ${file.display_name}:`, processingError);
            await sql`
              UPDATE app.canvas_imports
              SET status = 'error',
                  error_message = ${processingError instanceof Error ? processingError.message : 'Processing failed'},
                  updated_at = NOW()
              WHERE id = ${importId}
            `;
            failed++;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: { imported, forbidden, failed, skipped },
    });

  } catch (err) {
    console.error('Canvas import error:', err);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
