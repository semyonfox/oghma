import sql from "@/database/pgsql.js";
import { generateQuestion } from "./generate";
import { getCurrentBloomLevel, pickQuestionType } from "./bloom";
import logger from "@/lib/logger";

const BATCH_SIZE = 5;
const PARALLEL = 3;
const INTER_BATCH_DELAY_MS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Get chunk IDs that don't have any quiz questions yet for a given user.
 * Optionally scoped to specific chunk IDs or a course.
 */
export async function getUncoveredChunkIds(
  userId: string,
  opts?: { chunkIds?: string[]; courseId?: number; limit?: number },
): Promise<string[]> {
  const limit = opts?.limit ?? BATCH_SIZE;

  if (opts?.chunkIds && opts.chunkIds.length > 0) {
    // scoped to specific chunks (e.g. from an import job)
    const rows = await sql`
      SELECT c.id FROM app.chunks c
      JOIN app.notes n ON n.note_id = c.document_id
      WHERE c.user_id = ${userId}::uuid
        AND c.id = ANY(${opts.chunkIds}::uuid[])
        AND n.deleted = 0
        AND n.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM app.quiz_questions qq
          WHERE qq.chunk_id = c.id AND qq.user_id = ${userId}::uuid
        )
      ORDER BY c.created_at ASC
      LIMIT ${limit}
    `;
    return rows.map((r: any) => r.id);
  }

  if (opts?.courseId) {
    // scoped to a course
    const rows = await sql`
      SELECT c.id FROM app.chunks c
      JOIN app.notes n ON c.document_id = n.note_id
      WHERE c.user_id = ${userId}::uuid
        AND n.canvas_course_id = ${opts.courseId}
        AND n.deleted = 0
        AND n.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM app.quiz_questions qq
          WHERE qq.chunk_id = c.id AND qq.user_id = ${userId}::uuid
        )
      ORDER BY c.created_at ASC
      LIMIT ${limit}
    `;
    return rows.map((r: any) => r.id);
  }

  // all uncovered chunks for user
  const rows = await sql`
    SELECT c.id FROM app.chunks c
    JOIN app.notes n ON n.note_id = c.document_id
    WHERE c.user_id = ${userId}::uuid
      AND n.deleted = 0
      AND n.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM app.quiz_questions qq
        WHERE qq.chunk_id = c.id AND qq.user_id = ${userId}::uuid
      )
    ORDER BY c.created_at ASC
    LIMIT ${limit}
  `;
  return rows.map((r: any) => r.id);
}

/**
 * Generate questions for a batch of uncovered chunks.
 * Returns the number of questions successfully generated.
 */
export async function generateBatch(
  userId: string,
  chunkIds: string[],
): Promise<number> {
  let generated = 0;

  async function generateForChunk(chunkId: string): Promise<void> {
    const [chunk] = await sql`
      SELECT c.id, c.text, c.document_id, n.title, n.canvas_course_id
      FROM app.chunks c
      JOIN app.notes n ON c.document_id = n.note_id
      WHERE c.id = ${chunkId}::uuid
        AND c.user_id = ${userId}::uuid
        AND n.deleted = 0
        AND n.deleted_at IS NULL
    `;
    if (!chunk) return;

    // fetch neighboring chunks (1 before, 1 after) for broader topic context
    const neighbors = await sql`
      WITH ordered AS (
        SELECT id, text,
          ROW_NUMBER() OVER (ORDER BY page_number ASC NULLS LAST, created_at ASC) AS rn
        FROM app.chunks
        WHERE document_id = ${chunk.document_id}::uuid
          AND user_id = ${userId}::uuid
      ),
      target_rn AS (SELECT rn FROM ordered WHERE id = ${chunkId}::uuid)
      SELECT o.text
      FROM ordered o
      CROSS JOIN target_rn t
      WHERE o.rn BETWEEN t.rn - 1 AND t.rn + 1
      ORDER BY o.rn
    `;
    const contextText =
      neighbors.length > 1
        ? neighbors.map((n: any) => n.text).join("\n\n")
        : chunk.text;

    // check review history for adaptive bloom level
    const reviews = await sql`
      SELECT qq.bloom_level, qr.was_correct
      FROM app.quiz_reviews qr
      JOIN app.quiz_questions qq ON qr.question_id = qq.id
      WHERE qq.chunk_id = ${chunkId}::uuid AND qr.user_id = ${userId}::uuid
      ORDER BY qr.created_at ASC
    `;
    const bloomLevel = getCurrentBloomLevel(reviews);
    const questionType = pickQuestionType(bloomLevel);

    const question = await generateQuestion(
      userId,
      chunk.document_id,
      chunkId,
      contextText,
      chunk.title || "Unknown Module",
      bloomLevel,
      questionType,
      chunk.canvas_course_id,
    );

    if (question) generated++;
  }

  // process in parallel batches to balance throughput vs LLM rate limits
  for (let i = 0; i < chunkIds.length; i += PARALLEL) {
    const batch = chunkIds.slice(i, i + PARALLEL);
    const results = await Promise.allSettled(
      batch.map((id) => generateForChunk(id)),
    );
    for (const r of results) {
      if (r.status === "rejected") {
        logger.error("background quiz generation failed for chunk", {
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    }
    if (i + PARALLEL < chunkIds.length) {
      await sleep(INTER_BATCH_DELAY_MS);
    }
  }

  return generated;
}

/**
 * Seed initial questions after an import completes.
 * Generates up to `count` questions from the given chunk IDs.
 * Called from the import worker (Fargate).
 */
export async function seedQuestionsAfterImport(
  userId: string,
  importedChunkIds: string[],
  count: number = BATCH_SIZE,
): Promise<number> {
  const uncovered = await getUncoveredChunkIds(userId, {
    chunkIds: importedChunkIds,
    limit: count,
  });

  if (uncovered.length === 0) {
    logger.info("quiz seed: no uncovered chunks to generate for", { userId });
    return 0;
  }

  logger.info("quiz seed: generating initial questions after import", {
    userId,
    count: uncovered.length,
  });

  return generateBatch(userId, uncovered);
}

