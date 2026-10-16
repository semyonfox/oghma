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

// chunks from the given set that have no question yet, oldest first
async function getUncoveredChunkIds(
  userId: string,
  chunkIds: string[],
  limit: number,
): Promise<string[]> {
  const rows = await sql<IdRow[]>`
    SELECT c.id FROM app.chunks c
    JOIN app.notes n ON n.note_id = c.document_id
    WHERE c.user_id = ${userId}::uuid
      AND c.id = ANY(${chunkIds}::uuid[])
      AND n.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM app.quiz_questions qq
        WHERE qq.chunk_id = c.id AND qq.user_id = ${userId}::uuid
      )
    ORDER BY c.created_at ASC
    LIMIT ${limit}
  `;
  return rowIds(rows);
}

// session starts retry while generation runs, and each start schedules a
// batch for the same uncovered chunks. tracking in-flight chunks per process
// keeps those retries from paying for the same LLM call several times; the
// unique index still settles races between the app and the worker
const inFlightChunks = new Set<string>();

function claimChunks(userId: string, chunkIds: string[]): string[] {
  const claimed: string[] = [];
  for (const chunkId of new Set(chunkIds)) {
    const key = `${userId}:${chunkId}`;
    if (inFlightChunks.has(key)) continue;
    inFlightChunks.add(key);
    claimed.push(chunkId);
  }
  return claimed;
}

function releaseChunk(userId: string, chunkId: string): void {
  inFlightChunks.delete(`${userId}:${chunkId}`);
}

export async function generateBatch(
  userId: string,
  requestedChunkIds: string[],
): Promise<number> {
  const chunkIds = claimChunks(userId, requestedChunkIds);
  let generated = 0;

  async function generateForChunk(chunkId: string): Promise<number> {
    const [chunk] = await sql<ChunkRow[]>`
      SELECT c.id, c.text, c.document_id, n.title, n.canvas_course_id
      FROM app.chunks c
      JOIN app.notes n ON c.document_id = n.note_id
      WHERE c.id = ${chunkId}::uuid
        AND c.user_id = ${userId}::uuid
        AND n.deleted_at IS NULL
    `;
    if (!chunk) return 0;

    const neighbors = await sql<ChunkTextRow[]>`
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
        ? neighbors.map(({ text }) => text).join("\n\n")
        : chunk.text;

    const reviews = await sql<ReviewRow[]>`
      SELECT qq.bloom_level, qr.was_correct
      FROM app.quiz_reviews qr
      JOIN app.quiz_questions qq ON qr.question_id = qq.id
      WHERE qq.chunk_id = ${chunkId}::uuid AND qr.user_id = ${userId}::uuid
      ORDER BY qr.created_at ASC
    `;
    const bloomLevel = getCurrentBloomLevel(reviews);
    const questionType = pickQuestionType(bloomLevel);

    const question = await generateQuestion({
      userId,
      noteId: chunk.document_id,
      chunkId,
      chunkText: contextText,
      moduleName: chunk.title || "Unknown Module",
      bloomLevel,
      questionType,
      courseId: chunk.canvas_course_id ?? undefined,
    });

    return question ? 1 : 0;
  }

  for (let i = 0; i < chunkIds.length; i += PARALLEL) {
    const batch = chunkIds.slice(i, i + PARALLEL);
    const results = await Promise.allSettled(
      batch.map((id) =>
        generateForChunk(id).finally(() => releaseChunk(userId, id)),
      ),
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
  if (importedChunkIds.length === 0) return 0;
  const uncovered = await getUncoveredChunkIds(userId, importedChunkIds, count);

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
