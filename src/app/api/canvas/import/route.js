import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
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
 */
const PROCESSABLE_TYPES = new Set(['application/pdf']);

function resolveMimeType(filename, canvasMimeType) {
  if (canvasMimeType && PROCESSABLE_TYPES.has(canvasMimeType)) return canvasMimeType;
  if (filename?.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  return canvasMimeType;
}

/**
 * Creates a folder note and adds it to the tree under parentId (or root if null).
 * Returns the new folder's UUID.
 */
async function createFolder(userId, title, parentId) {
  const folderId = uuidv4();
  await sql`
    INSERT INTO app.notes (note_id, user_id, title, content, is_folder, deleted, created_at, updated_at)
    VALUES (${folderId}::uuid, ${userId}::uuid, ${title}, '', true, 0, NOW(), NOW())
  `;
  await addNoteToTree(userId, folderId, parentId ?? null);
  return folderId;
}

/**
 * POST /api/canvas/import
 *
 * Imports selected Canvas courses into the note tree with the hierarchy:
 *
 *   Course Name/
 *     Module Name/
 *       file.pdf
 *     Assignments/
 *       Assignment Name/
 *         attached-file.pdf
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

    let imported = 0;
    let forbidden = 0;
    let failed = 0;
    let skipped = 0;
    let alreadyImported = 0;

    for (const courseId of courseIds) {
      // Fetch course metadata to build the folder title
      const { data: courseData } = await client.getCourse(courseId);
      const courseTitle = courseData
        ? [courseData.course_code, courseData.name].filter(Boolean).join(' — ')
        : String(courseId);

      // Top-level course folder
      let courseFolderId = null;
      try {
        courseFolderId = await createFolder(user.user_id, courseTitle, null);
      } catch (err) {
        console.warn(`Failed to create course folder (${courseTitle}): ${err.message}`);
      }

      // ── Module folders ──────────────────────────────────────────────────────

      const { data: modules, forbidden: modulesForbidden } = await client.getModules(courseId);

      if (!modulesForbidden && modules) {
        const moduleFolderMap = {};

        for (const module of modules) {
          const { data: items } = await client.getModuleItems(courseId, module.id);
          if (!items) continue;

          const fileItems = items.filter(item => item.type === 'File');
          if (fileItems.length === 0) continue;

          // Create module folder inside the course folder (once per module)
          const moduleKey = `${courseId}:${module.id}`;
          if (!moduleFolderMap[moduleKey]) {
            try {
              moduleFolderMap[moduleKey] = await createFolder(user.user_id, module.name, courseFolderId);
            } catch (err) {
              console.warn(`Failed to create module folder (${module.name}): ${err.message}`);
              moduleFolderMap[moduleKey] = courseFolderId;
            }
          }
          const moduleFolderId = moduleFolderMap[moduleKey];

          for (const item of fileItems) {
            const { data: file, forbidden: fileForbidden, error: fileError } = await client.getFile(courseId, item.content_id);

            if (fileForbidden || !file) {
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

            const resolvedMimeType = resolveMimeType(file.display_name, file.content_type);

            if (!PROCESSABLE_TYPES.has(resolvedMimeType)) {
              skipped++;
              continue;
            }

            // skip files already successfully imported (dedup)
            const existing = await sql`
              SELECT 1 FROM app.canvas_imports
              WHERE user_id = ${user.user_id}::uuid AND canvas_file_id = ${file.id}::int AND status = 'complete'
              LIMIT 1
            `;
            if (existing.length > 0) {
              alreadyImported++;
              continue;
            }

            const importRecord = await sql`
              INSERT INTO app.canvas_imports
                (user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status)
              VALUES
                (${user.user_id}, ${courseId}, ${module.id}, ${file.id},
                 ${file.display_name}, ${resolvedMimeType}, 'downloading')
              RETURNING id
            `;
            const importId = importRecord[0].id;

            const { buffer, forbidden: dlForbidden, error: dlError } = await client.downloadFile(file.url);

            if (dlForbidden || !buffer) {
              await sql`
                UPDATE app.canvas_imports
                SET status = 'forbidden', error_message = ${dlError ?? 'Download restricted'}, updated_at = NOW()
                WHERE id = ${importId}
              `;
              forbidden++;
              continue;
            }

            try {
              await sql`
                UPDATE app.canvas_imports SET status = 'processing', updated_at = NOW()
                WHERE id = ${importId}
              `;

              const s3Key = `canvas/${user.user_id}/${courseId}/${module.id}/${file.filename}`;
              await storage.putObject(s3Key, buffer, { contentType: resolvedMimeType });

              const noteId = uuidv4();
              await sql`
                INSERT INTO app.notes (note_id, user_id, title, content, s3_key, is_folder, deleted, created_at, updated_at)
                VALUES (${noteId}::uuid, ${user.user_id}::uuid, ${file.display_name}, '', ${s3Key}, false, 0, NOW(), NOW())
              `;
              await addNoteToTree(user.user_id, noteId, moduleFolderId);

              await runRagPipeline(noteId, buffer);

              await sql`
                UPDATE app.canvas_imports
                SET status = 'complete', note_id = ${noteId}, updated_at = NOW()
                WHERE id = ${importId}
              `;
              imported++;
            } catch (err) {
              console.error(`Failed to process file ${file.display_name}: ${err.message}`);
              await sql`
                UPDATE app.canvas_imports
                SET status = 'error', error_message = ${err.message}, updated_at = NOW()
                WHERE id = ${importId}
              `;
              failed++;
            }
          }
        }
      } else {
        console.warn(`Course ${courseId} modules are restricted or unavailable`);
      }

      // ── Assignments folder ──────────────────────────────────────────────────

      const { data: assignments, forbidden: assignmentsForbidden } = await client.getAssignments(courseId);

      if (!assignmentsForbidden && assignments && assignments.length > 0) {
        const assignmentsWithFiles = assignments.filter(a =>
          (a.attachments ?? []).some(att => PROCESSABLE_TYPES.has(resolveMimeType(att.display_name, att.content_type)))
        );

        if (assignmentsWithFiles.length > 0) {
          let assignmentsFolderId = courseFolderId;
          try {
            assignmentsFolderId = await createFolder(user.user_id, 'Assignments', courseFolderId);
          } catch (err) {
            console.warn(`Failed to create Assignments folder: ${err.message}`);
          }

          for (const assignment of assignmentsWithFiles) {
            const attachments = (assignment.attachments ?? []).filter(att =>
              PROCESSABLE_TYPES.has(resolveMimeType(att.display_name, att.content_type))
            );

            let assignmentFolderId = assignmentsFolderId;
            try {
              assignmentFolderId = await createFolder(user.user_id, assignment.name, assignmentsFolderId);
            } catch (err) {
              console.warn(`Failed to create folder for assignment (${assignment.name}): ${err.message}`);
            }

            for (const attachment of attachments) {
              const resolvedMimeType = resolveMimeType(attachment.display_name, attachment.content_type);

              // dedup check for assignment attachments
              const existingAtt = await sql`
                SELECT 1 FROM app.canvas_imports
                WHERE user_id = ${user.user_id}::uuid AND canvas_file_id = ${attachment.id ?? 0}::int AND status = 'complete'
                LIMIT 1
              `;
              if (existingAtt.length > 0) {
                alreadyImported++;
                continue;
              }

              const importRecord = await sql`
                INSERT INTO app.canvas_imports
                  (user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status)
                VALUES
                  (${user.user_id}, ${courseId}, 0, ${attachment.id ?? 0},
                   ${attachment.display_name}, ${resolvedMimeType}, 'downloading')
                RETURNING id
              `;
              const importId = importRecord[0].id;

              const { buffer, forbidden: dlForbidden, error: dlError } = await client.downloadFile(attachment.url);

              if (dlForbidden || !buffer) {
                await sql`
                  UPDATE app.canvas_imports
                  SET status = 'forbidden', error_message = ${dlError ?? 'Download restricted'}, updated_at = NOW()
                  WHERE id = ${importId}
                `;
                forbidden++;
                continue;
              }

              try {
                await sql`
                  UPDATE app.canvas_imports SET status = 'processing', updated_at = NOW()
                  WHERE id = ${importId}
                `;

                const s3Key = `canvas/${user.user_id}/${courseId}/assignments/${assignment.id}/${attachment.filename ?? attachment.display_name}`;
                await storage.putObject(s3Key, buffer, { contentType: resolvedMimeType });

                const noteId = uuidv4();
                await sql`
                  INSERT INTO app.notes (note_id, user_id, title, content, s3_key, is_folder, deleted, created_at, updated_at)
                  VALUES (${noteId}::uuid, ${user.user_id}::uuid, ${attachment.display_name}, '', ${s3Key}, false, 0, NOW(), NOW())
                `;
                await addNoteToTree(user.user_id, noteId, assignmentFolderId);

                await runRagPipeline(noteId, buffer);

                await sql`
                  UPDATE app.canvas_imports
                  SET status = 'complete', note_id = ${noteId}, updated_at = NOW()
                  WHERE id = ${importId}
                `;
                imported++;
              } catch (err) {
                console.error(`Failed to process assignment file ${attachment.display_name}: ${err.message}`);
                await sql`
                  UPDATE app.canvas_imports
                  SET status = 'error', error_message = ${err.message}, updated_at = NOW()
                  WHERE id = ${importId}
                `;
                failed++;
              }
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: { imported, forbidden, failed, skipped, alreadyImported },
    });

  } catch (err) {
    console.error('Canvas import error:', err);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}

// ── RAG pipeline ──────────────────────────────────────────────────────────────

async function runRagPipeline(noteId, buffer) {
  try {
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = pdfParseModule.default ?? pdfParseModule;
    const parsed = await pdfParse(buffer);
    const cleanedText = processExtractedText(parsed.text);
    const chunks = chunkText(cleanedText);
    const embeddings = await embedChunks(chunks);
    const documentVector = embeddings[0]?.vector ?? null;

    await sql`
      UPDATE app.notes
      SET extracted_text = ${cleanedText},
          embedding = ${documentVector ? JSON.stringify(documentVector) : null}::vector,
          updated_at = NOW()
      WHERE note_id = ${noteId}
    `;
  } catch (err) {
    // RAG failure is non-fatal — note is still usable without embeddings
    console.error(`RAG pipeline error for note ${noteId}: ${err.message}`);
  }
}
