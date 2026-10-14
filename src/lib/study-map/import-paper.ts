import { createHash } from "node:crypto";
import type postgres from "postgres";
import { v5 as uuidv5 } from "uuid";
import sql from "@/database/pgsql";
import { ApiError } from "@/lib/api-errors";
import logger from "@/lib/logger";
import {
  insertNoteWithTree,
  InvalidNoteParentError,
} from "@/lib/notes/storage/create-note";
import { invalidateTreeAfterPublish } from "@/lib/notes/tree-cache";
import { enqueueNoteReindexJob } from "@/lib/queue";
import { getStorageProvider } from "@/lib/storage/init";
import { generateUUID } from "@/lib/utils/uuid";
import { lockStudyMap, lockStudySource } from "./mutations";
import {
  MAX_EXAM_PDF_BYTES,
  type ExamPaperImport,
  type ExamPaperImportResult,
} from "./paper-import-format";
import type { MaterialOverrides } from "./types";

// fixed namespace so the same user, map and PDF always resolve to the same notes
const EXAM_PAPER_NAMESPACE = "6f1d8f0e-3a52-5c4b-9d7e-2b8a41c0e913";
const MAX_MATERIALS = 500;

interface PaperIds {
  pdf: string;
  text: string;
}

interface ExistingNoteRow {
  note_id: string;
  active: boolean;
  s3_key: string | null;
  extracted_from_note_id: string | null;
}

type PublishOutcome =
  { created: true; rootNoteId: string } | { created: false };

function paperIds(userId: string, mapId: string, sha256: string): PaperIds {
  const name = `${userId}:${mapId}:${sha256}`;
  return {
    pdf: uuidv5(`${name}:pdf`, EXAM_PAPER_NAMESPACE),
    text: uuidv5(`${name}:text`, EXAM_PAPER_NAMESPACE),
  };
}

function decodePdf(input: ExamPaperImport): Buffer {
  const pdf = Buffer.from(input.pdfBase64, "base64");
  if (pdf.length === 0 || pdf.length > MAX_EXAM_PDF_BYTES)
    throw new ApiError(413, "The exam PDF is empty or larger than 32 MB");
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-")
    throw new ApiError(400, "The exam file is not a PDF");
  if (createHash("sha256").update(pdf).digest("hex") !== input.sha256)
    throw new ApiError(400, "The exam PDF does not match its SHA-256");
  return pdf;
}

function paperTitles(input: ExamPaperImport) {
  // matching stems let the PDF viewer find its extraction as well as the explicit link
  const stem =
    input.filename.slice(0, -4) +
    (input.archiveId ? `_${input.archiveId}` : "") +
    (input.language ? "_ga" : "");
  return { pdf: `${stem}.pdf`, text: `${stem}.md` };
}

function paperLabels(input: ExamPaperImport): string[] {
  return [
    input.moduleCode,
    input.academicYear,
    `Sitting ${input.sitting}`,
    `Period ${input.period}`,
  ];
}

const conflict = () =>
  new ApiError(
    409,
    "This paper was imported into this map before, but its notes were deleted, moved to Trash, or unlinked. Restore or permanently delete them before importing it again.",
  );

/** Validates an earlier import of the same PDF. Partial or trashed pairs are never overwritten or revived. */
async function existingPaper(
  tx: postgres.TransactionSql,
  userId: string,
  ids: PaperIds,
): Promise<boolean> {
  const rows = await tx<ExistingNoteRow[]>`
    SELECT n.note_id, n.s3_key, n.extracted_from_note_id,
      (n.deleted_at IS NULL AND NOT n.is_folder AND NOT n.is_import_cache_source
        AND EXISTS (SELECT 1 FROM app.tree_items t WHERE t.user_id = n.user_id AND t.note_id = n.note_id)) AS active
    FROM app.notes n
    WHERE n.user_id = ${userId}::uuid AND n.note_id = ANY(${[ids.pdf, ids.text]}::uuid[])
    FOR SHARE OF n
  `;
  if (rows.length === 0) return false;
  const pdf = rows.find((row) => row.note_id === ids.pdf);
  const text = rows.find((row) => row.note_id === ids.text);
  if (
    !pdf?.active ||
    !text?.active ||
    !pdf.s3_key ||
    text.extracted_from_note_id !== ids.pdf
  )
    throw conflict();
  return true;
}

async function publishPaper(
  userId: string,
  mapId: string,
  input: ExamPaperImport,
  ids: PaperIds,
  upload: { key: string; bytes: number } | null,
): Promise<PublishOutcome> {
  return sql.begin(async (tx): Promise<PublishOutcome> => {
    const map = await lockStudyMap(tx, userId, mapId);
    if (await existingPaper(tx, userId, ids)) return { created: false };
    // only the pre-check saw no notes; a trashed pair committed since then is caught above
    if (!upload) throw conflict();
    const rootNoteId = map.root_note_id;
    if (!rootNoteId)
      throw new ApiError(
        409,
        "Choose a folder for this study map before importing exam papers",
      );

    const titles = paperTitles(input);
    try {
      await insertNoteWithTree(tx, {
        noteId: ids.pdf,
        userId,
        title: titles.pdf,
        content: "",
        isFolder: false,
        parentId: rootNoteId,
        canvasCourseId: map.canvas_course_id,
        canvasAcademicYear: map.academic_year,
        s3Key: upload.key,
      });
      await insertNoteWithTree(tx, {
        noteId: ids.text,
        userId,
        title: titles.text,
        content: input.text,
        isFolder: false,
        parentId: rootNoteId,
        canvasCourseId: map.canvas_course_id,
        canvasAcademicYear: map.academic_year,
      });
    } catch (error) {
      if (error instanceof InvalidNoteParentError)
        throw new ApiError(
          409,
          "This study map's folder is no longer available. Choose another folder and try again.",
        );
      throw error;
    }
    await tx`
      INSERT INTO app.attachments (id, note_id, user_id, filename, s3_key, mime_type, file_size)
      VALUES (${generateUUID()}::uuid, ${ids.pdf}::uuid, ${userId}::uuid, ${titles.pdf},
        ${upload.key}, 'application/pdf', ${upload.bytes})
    `;
    // extracted_text stays empty so the reindex worker builds it from content
    const coverage = JSON.stringify({
      source: "exam-paper-import",
      page_range: null,
      partial: input.warnings.some((warning) =>
        /no text|scanned|OCR/i.test(warning),
      ),
      warnings: input.warnings,
      extracted_at: new Date().toISOString(),
    });
    await tx`
      UPDATE app.notes
      SET extracted_from_note_id = ${ids.pdf}::uuid, extraction_coverage = ${coverage}::text::jsonb
      WHERE user_id = ${userId}::uuid AND note_id = ${ids.text}::uuid
    `;

    const source = await lockStudySource(tx, userId, ids.pdf);
    if (source.noteId !== ids.text)
      throw new Error(
        "Exam paper text did not resolve as the PDF's study source",
      );
    const overrides: MaterialOverrides = {
      kind: "past_paper",
      labels: paperLabels(input),
      topics: {},
      sourceHash: source.hash,
      taxonomyVersion: map.taxonomy_version,
    };
    await tx`
      INSERT INTO app.study_materials (map_id, user_id, note_id, kind, labels, overrides)
      VALUES (${mapId}::uuid, ${userId}::uuid, ${ids.pdf}::uuid, 'past_paper', ${paperLabels(input)}, ${JSON.stringify(overrides)}::text::jsonb)
    `;
    // the text sits under the map folder too; an excluded row stops folder sync adding it as a second material
    await tx`
      INSERT INTO app.study_materials (map_id, user_id, note_id, excluded)
      VALUES (${mapId}::uuid, ${userId}::uuid, ${ids.text}::uuid, TRUE)
    `;
    const [count] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count FROM app.study_materials
      WHERE map_id = ${mapId}::uuid AND user_id = ${userId}::uuid AND NOT excluded
    `;
    if (count.count > MAX_MATERIALS)
      throw new ApiError(
        400,
        "A study map supports up to 500 materials. Remove materials or use a separate map.",
      );
    await tx`UPDATE app.study_maps SET updated_at = NOW() WHERE id = ${mapId}::uuid AND user_id = ${userId}::uuid`;
    return { created: true, rootNoteId };
  });
}

async function queueIndexing(
  userId: string,
  textNoteId: string,
): Promise<ExamPaperImportResult["indexing"]> {
  try {
    await enqueueNoteReindexJob(textNoteId, userId);
    return "queued";
  } catch (error) {
    logger.warn("exam paper reindex could not be queued", {
      noteId: textNoteId,
      error: error instanceof Error ? error.message : String(error),
    });
    return "retry-needed";
  }
}

/**
 * Store one exam PDF and its page text as a linked pair in the map folder and
 * add the PDF to the map as a past paper. Repeating the same PDF returns the
 * existing pair and requeues indexing, so retries never replace user edits.
 */
export async function importExamPaper(
  userId: string,
  mapId: string,
  input: ExamPaperImport,
): Promise<ExamPaperImportResult> {
  const pdf = decodePdf(input);
  const ids = paperIds(userId, mapId, input.sha256);

  // cheap ownership and duplicate checks so rejected or repeated imports upload nothing
  const [map] = await sql<{ root_note_id: string | null }[]>`
    SELECT root_note_id FROM app.study_maps WHERE user_id = ${userId}::uuid AND id = ${mapId}::uuid
  `;
  if (!map) throw new ApiError(404, "Study map not found");
  const [seen] = await sql<{ note_id: string }[]>`
    SELECT note_id FROM app.notes
    WHERE user_id = ${userId}::uuid AND note_id = ANY(${[ids.pdf, ids.text]}::uuid[])
    LIMIT 1
  `;
  if (!seen && !map.root_note_id)
    throw new ApiError(
      409,
      "Choose a folder for this study map before importing exam papers",
    );

  // a fresh key per attempt means cleanup can never remove another attempt's object
  const upload = seen
    ? null
    : {
        key: `notes/${ids.pdf}/${generateUUID()}/${input.filename}`,
        bytes: pdf.length,
      };
  if (upload)
    await getStorageProvider().putObject(upload.key, pdf, {
      contentType: "application/pdf",
    });

  let outcome: PublishOutcome;
  try {
    outcome = await publishPaper(userId, mapId, input, ids, upload);
  } catch (error) {
    if (upload) {
      // a lost connection can hide a successful commit; retain the bytes if ownership is uncertain
      try {
        const [attached] = await sql<{ note_id: string }[]>`
          SELECT note_id FROM app.notes
          WHERE user_id = ${userId}::uuid AND note_id = ${ids.pdf}::uuid AND s3_key = ${upload.key}
        `;
        if (!attached) await getStorageProvider().deleteObject(upload.key);
      } catch (cleanupError) {
        logger.warn("exam import cleanup needs retry", {
          key: upload.key,
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        });
      }
    }
    throw error;
  }

  if (!outcome.created) {
    // lost a race with a parallel import of the same PDF
    if (upload)
      await getStorageProvider()
        .deleteObject(upload.key)
        .catch((cleanupError: unknown) => {
          logger.warn("unused exam paper object could not be removed", {
            key: upload.key,
            error:
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError),
          });
        });
    return {
      noteId: ids.pdf,
      textNoteId: ids.text,
      duplicate: true,
      indexing: await queueIndexing(userId, ids.text),
    };
  }

  // the pair is durable now; later failures must not touch the stored object
  try {
    await invalidateTreeAfterPublish(userId, outcome.rootNoteId);
  } catch (error) {
    logger.warn("tree cache invalidation failed after exam paper import", {
      noteId: ids.pdf,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return {
    noteId: ids.pdf,
    textNoteId: ids.text,
    duplicate: false,
    indexing: await queueIndexing(userId, ids.text),
  };
}
