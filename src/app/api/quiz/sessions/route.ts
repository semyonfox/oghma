import { NextRequest, NextResponse, after } from "next/server";
import {
  parseJsonObject,
  requireAuth,
  withErrorHandler,
  tracedError,
} from "@/lib/api-error";
import { generateUUID } from "@/lib/utils/uuid";
import {
  resolveChunkIds,
  getSessionCandidates,
  selectCards,
  sessionCardIds,
} from "@/lib/quiz/select";
import { generateBatch } from "@/lib/quiz/generate-background";
import { loadSessionQuestion } from "@/lib/quiz/session-question";
import { SESSION_DEFAULTS } from "@/lib/quiz/types";
import type { QuizSessionStartResponse } from "@/lib/quiz/types";
import sql from "@/database/pgsql";
import {
  quizSessionCreateSchema,
  validateBody,
} from "@/lib/validations/schemas";

// generation limits — all generation is background-only (never blocks the response)
const AI_GENERATION_PER_MODULE = 5;  // max questions generated per module per trigger
const AI_GENERATION_BATCH_SIZE = 25; // upper bound for total background pass

interface ChunkModuleRow {
  id: string;
  module_id: string;
}

// spread one pass across modules so a single large module can't use it all
async function pickChunksToGenerate(
  userId: string,
  uncoveredChunkIds: string[],
): Promise<string[]> {
  const rows = await sql<ChunkModuleRow[]>`
    SELECT c.id, COALESCE(n.canvas_module_id, -1)::text AS module_id
    FROM app.chunks c
    JOIN app.notes n ON c.document_id = n.note_id
    WHERE c.user_id = ${userId}::uuid
      AND c.id = ANY(${uncoveredChunkIds}::uuid[])
    ORDER BY random()
  `;

  const picked: string[] = [];
  const moduleCounts = new Map<string, number>();
  for (const row of rows) {
    const used = moduleCounts.get(row.module_id) ?? 0;
    if (used >= AI_GENERATION_PER_MODULE) continue;
    picked.push(row.id);
    moduleCounts.set(row.module_id, used + 1);
    if (picked.length >= AI_GENERATION_BATCH_SIZE) break;
  }
  return picked;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await requireAuth();

  const zodResult = validateBody(
    quizSessionCreateSchema,
    await parseJsonObject(request),
  );
  if (!zodResult.success) return zodResult.response;
  const filter = zodResult.data;
  const filterValue = "filterValue" in filter ? filter.filterValue : null;

  const userId = user.user_id;

  const chunkIds = await resolveChunkIds(userId, filter);
  if (chunkIds.length === 0) {
    return tracedError(
      "No content found for this filter. Import some notes first.",
      404,
    );
  }

  const candidates = await getSessionCandidates(userId, chunkIds);
  const { uncoveredChunkIds } = candidates;

  // schedule background generation for uncovered chunks — never blocks the response
  if (uncoveredChunkIds.length > 0) {
    const bgChunkIds = await pickChunksToGenerate(userId, uncoveredChunkIds);
    if (bgChunkIds.length > 0) {
      after(() => generateBatch(userId, bgChunkIds));
    }
  }

  const maxQuestions = filter.maxQuestions || SESSION_DEFAULTS.maxQuestions;
  const cardIds = sessionCardIds(selectCards(candidates, maxQuestions), maxQuestions);

  if (cardIds.length === 0) {
    // no cards yet — generation was kicked off above, so tell the client to retry
    if (uncoveredChunkIds.length > 0) {
      return NextResponse.json(
        { generating: true, retryAfter: 3 },
        { status: 202 },
      );
    }
    return tracedError(
      "Could not prepare quiz questions right now. Please try again in a moment.",
      503,
    );
  }

  // card_ids are persisted so the session can be resumed after a refresh
  const sessionId = generateUUID();
  await sql`
        INSERT INTO app.quiz_sessions (id, user_id, filter_type, filter_value, total_questions, card_ids)
        VALUES (
            ${sessionId}::uuid,
            ${userId}::uuid,
            ${filter.filterType},
            ${filterValue === null ? null : JSON.stringify(filterValue)}::text::jsonb,
            ${cardIds.length},
            to_jsonb(${cardIds}::uuid[])
        )
    `;

  const body: QuizSessionStartResponse = {
    sessionId,
    totalQuestions: cardIds.length,
    cardIds,
    currentIndex: 0,
    question: await loadSessionQuestion(userId, cardIds[0]),
  };
  return NextResponse.json(body, { status: 201 });
});
