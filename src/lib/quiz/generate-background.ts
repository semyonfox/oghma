import sql from "@/database/pgsql.js";
import { generateQuestion } from "./generate";
import { getCurrentBloomLevel, pickQuestionType } from "./bloom";
import logger from "@/lib/logger";

const BATCH_SIZE = 5;
const INTER_QUESTION_DELAY_MS = 300;

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
      WHERE c.user_id = ${userId}::uuid
        AND c.id = ANY(${opts.chunkIds}::uuid[])
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
    WHERE c.user_id = ${userId}::uuid
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

  for (const chunkId of chunkIds) {
    try {
      const [chunk] = await sql`
        SELECT c.id, c.text, c.document_id, n.title, n.canvas_course_id
        FROM app.chunks c
        JOIN app.notes n ON c.document_id = n.note_id
        WHERE c.id = ${chunkId}::uuid
      `;
      if (!chunk) continue;

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
        chunk.text,
        chunk.title || "Unknown Module",
        bloomLevel,
        questionType,
        chunk.canvas_course_id,
      );

      if (question) generated++;

      // rate limit between LLM calls
      if (chunkIds.indexOf(chunkId) < chunkIds.length - 1) {
        await sleep(INTER_QUESTION_DELAY_MS);
      }
    } catch (err) {
      logger.error("background quiz generation failed for chunk", {
        chunkId,
        error: err instanceof Error ? err.message : String(err),
      });
      // continue with next chunk, don't fail the whole batch
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

/**
 * Ensure a minimum buffer of pre-generated questions exists for a user's scope.
 * Called from quiz API routes (Next.js) to keep questions ahead of the user.
 *
 * Returns immediately if buffer is sufficient. Generates more if below threshold.
 * This is meant to be called fire-and-forget (non-blocking).
 */
export async function ensureQuestionBuffer(
  userId: string,
  opts?: { courseId?: number; filterChunkIds?: string[] },
  minBuffer: number = 3,
): Promise<void> {
  const uncovered = await getUncoveredChunkIds(userId, {
    chunkIds: opts?.filterChunkIds,
    courseId: opts?.courseId,
    limit: BATCH_SIZE,
  });

  if (uncovered.length === 0) return; // all chunks covered

  // check how many unreviewed (new) cards exist
  const [{ count }] = await sql`
    SELECT COUNT(*)::int as count
    FROM app.quiz_cards qc
    WHERE qc.user_id = ${userId}::uuid
      AND qc.state = 'new'
  `;

  if (count >= minBuffer) return; // buffer is sufficient

  logger.info("quiz buffer: generating more questions", {
    userId,
    currentBuffer: count,
    minBuffer,
    generating: uncovered.length,
  });

  await generateBatch(userId, uncovered);
}
