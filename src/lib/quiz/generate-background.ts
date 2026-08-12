import sql from "@/database/pgsql";
import { generateQuestion } from "./generate";
import { getCurrentBloomLevel, pickQuestionType } from "./bloom";
import logger from "@/lib/logger";

const BATCH_SIZE = 5;
const PARALLEL = 3;
const INTER_BATCH_DELAY_MS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface IdRow {
  id: string;
}

interface ChunkRow {
  id: string;
  text: string;
  document_id: string;
  title: string | null;
  canvas_course_id: string | null;
}

interface ChunkTextRow {
  text: string;
}

interface ReviewRow {
  bloom_level: number;
  was_correct: boolean;
}

function rowIds(rows: IdRow[]): string[] {
  return rows.map(({ id }) => id);
}

export async function getUncoveredChunkIds(
  userId: string,
  opts?: { chunkIds?: string[]; courseId?: string; limit?: number },
): Promise<string[]> {
  const limit = opts?.limit ?? BATCH_SIZE;

  if (opts?.chunkIds && opts.chunkIds.length > 0) {
    const rows = await sql`
      SELECT c.id FROM app.chunks c
      JOIN app.notes n ON n.note_id = c.document_id
      WHERE c.user_id = ${userId}::uuid
        AND c.id = ANY(${opts.chunkIds}::uuid[])
        AND n.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM app.quiz_questions qq
          WHERE qq.chunk_id = c.id AND qq.user_id = ${userId}::uuid
        )
      ORDER BY c.created_at ASC
      LIMIT ${limit}
    `;
    return rowIds(rows as IdRow[]);
  }

  if (opts?.courseId) {
    const rows = await sql`
      SELECT c.id FROM app.chunks c
      JOIN app.notes n ON c.document_id = n.note_id
      WHERE c.user_id = ${userId}::uuid
        AND n.canvas_course_id = ${opts.courseId}::bigint
        AND n.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM app.quiz_questions qq
          WHERE qq.chunk_id = c.id AND qq.user_id = ${userId}::uuid
        )
      ORDER BY c.created_at ASC
      LIMIT ${limit}
    `;
    return rowIds(rows as IdRow[]);
  }

  const rows = await sql`
    SELECT c.id FROM app.chunks c
    JOIN app.notes n ON n.note_id = c.document_id
    WHERE c.user_id = ${userId}::uuid
      AND n.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM app.quiz_questions qq
        WHERE qq.chunk_id = c.id AND qq.user_id = ${userId}::uuid
      )
    ORDER BY c.created_at ASC
    LIMIT ${limit}
  `;
  return rowIds(rows as IdRow[]);
}

export async function generateBatch(
  userId: string,
  chunkIds: string[],
): Promise<number> {
  let generated = 0;

  async function generateForChunk(chunkId: string): Promise<number> {
    const [chunk] = (await sql`
      SELECT c.id, c.text, c.document_id, n.title, n.canvas_course_id
      FROM app.chunks c
      JOIN app.notes n ON c.document_id = n.note_id
      WHERE c.id = ${chunkId}::uuid
        AND c.user_id = ${userId}::uuid
        AND n.deleted_at IS NULL
    `) as ChunkRow[];
    if (!chunk) return 0;

    const neighbors = (await sql`
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
    `) as ChunkTextRow[];
    const contextText =
      neighbors.length > 1
        ? neighbors.map(({ text }) => text).join("\n\n")
        : chunk.text;

    const reviews = (await sql`
      SELECT qq.bloom_level, qr.was_correct
      FROM app.quiz_reviews qr
      JOIN app.quiz_questions qq ON qr.question_id = qq.id
      WHERE qq.chunk_id = ${chunkId}::uuid AND qr.user_id = ${userId}::uuid
      ORDER BY qr.created_at ASC
    `) as ReviewRow[];
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
      chunk.canvas_course_id ?? undefined,
    );

    return question ? 1 : 0;
  }

  for (let i = 0; i < chunkIds.length; i += PARALLEL) {
    const batch = chunkIds.slice(i, i + PARALLEL);
    const results = await Promise.allSettled(
      batch.map((id) => generateForChunk(id)),
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        generated += r.value;
      } else {
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
