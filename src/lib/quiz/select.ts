import type { z } from "zod";
import { embedText } from "@/lib/rag/embeddings";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import type { quizSessionCreateSchema } from "@/lib/validations/schemas";
import type { CardState } from "./types";
import { SESSION_DEFAULTS } from "./types";
import { searchChunkVectors } from "@/lib/qdrant";

export type QuizSessionFilter = z.infer<typeof quizSessionCreateSchema>;

// a card reviewed this recently is not worth a retention check yet
const RETENTION_MIN_AGE_MS = 12 * 60 * 60 * 1000;
const SEARCH_CHUNK_LIMIT = 30;

export interface CandidateCard {
  id: string;
  due: string | Date;
  state: CardState;
  last_review: string | Date | null;
}

interface IdRow {
  id: string;
}

interface ChatMessageRow {
  sources: unknown;
}

export interface SessionCandidates {
  dueCards: CandidateCard[];
  newCards: CandidateCard[];
  retentionCards: CandidateCard[];
  uncoveredChunkIds: string[];
}

export interface SelectionResult {
  due: CandidateCard[];
  new: CandidateCard[];
  retention: CandidateCard[];
}

function time(value: string | Date): number {
  return new Date(value).getTime();
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Split the session between due reviews, unseen cards and retention checks by
 * the configured weights. Rounding overflow is trimmed from the lowest priority
 * bucket, then unused slots are backfilled in priority order so a short bucket
 * never leaves the session smaller than it could be.
 */
export function allocateSlots(
  sizes: readonly [number, number, number],
  maxQuestions: number,
): [number, number, number] {
  const weights = [
    SESSION_DEFAULTS.weightDue,
    SESSION_DEFAULTS.weightNew,
    SESSION_DEFAULTS.weightRetention,
  ];
  const counts = sizes.map((size, i) =>
    Math.min(size, Math.round(maxQuestions * weights[i])),
  ) as [number, number, number];

  let overflow = counts[0] + counts[1] + counts[2] - maxQuestions;
  for (let i = counts.length - 1; i >= 0 && overflow > 0; i--) {
    const cut = Math.min(overflow, counts[i]);
    counts[i] -= cut;
    overflow -= cut;
  }

  let remaining = maxQuestions - (counts[0] + counts[1] + counts[2]);
  for (let i = 0; i < counts.length && remaining > 0; i++) {
    const add = Math.min(remaining, sizes[i] - counts[i]);
    counts[i] += add;
    remaining -= add;
  }
  return counts;
}

export function selectCards(
  candidates: Pick<SessionCandidates, "dueCards" | "newCards" | "retentionCards">,
  maxQuestions: number,
): SelectionResult {
  const [dueCount, newCount, retentionCount] = allocateSlots(
    [
      candidates.dueCards.length,
      candidates.newCards.length,
      candidates.retentionCards.length,
    ],
    maxQuestions,
  );
  const byDue = (a: CandidateCard, b: CandidateCard) => time(a.due) - time(b.due);

  return {
    // most overdue first, and new cards in the order they were generated
    due: [...candidates.dueCards].sort(byDue).slice(0, dueCount),
    new: [...candidates.newCards].sort(byDue).slice(0, newCount),
    retention: shuffled(candidates.retentionCards).slice(0, retentionCount),
  };
}

export function sessionCardIds(
  selection: SelectionResult,
  maxQuestions: number,
): string[] {
  return [
    ...new Set(
      [...selection.due, ...selection.new, ...selection.retention].map(
        ({ id }) => id,
      ),
    ),
  ].slice(0, maxQuestions);
}

function rowIds(rows: IdRow[]): string[] {
  return rows.map(({ id }) => id);
}

function sourceNoteIds(sources: unknown): string[] {
  if (!Array.isArray(sources)) return [];

  return sources.flatMap((source) => {
    if (source === null || typeof source !== "object" || Array.isArray(source)) {
      return [];
    }

    const id = (source as Record<string, unknown>).id;
    return typeof id === "string" ? [id] : [];
  });
}

async function liveChunkIdsForNotes(
  userId: string,
  noteIds: string[],
): Promise<string[]> {
  const rows = await sql<IdRow[]>`
    SELECT c.id
    FROM app.chunks c
    JOIN app.notes n ON n.note_id = c.document_id
    WHERE c.user_id = ${userId}::uuid
      AND c.document_id = ANY(${noteIds}::uuid[])
      AND n.deleted_at IS NULL
  `;
  return rowIds(rows);
}

// the same literal match chat search falls back to, so a quiz can still start
// while the embedding provider or Qdrant is down
async function keywordChunkIds(userId: string, query: string): Promise<string[]> {
  const pattern = `%${query.replace(/[\\%_]/g, (value) => `\\${value}`)}%`;
  const rows = await sql<IdRow[]>`
    SELECT c.id
    FROM app.chunks c
    JOIN app.notes n ON n.note_id = c.document_id
    WHERE c.user_id = ${userId}::uuid
      AND n.user_id = ${userId}::uuid
      AND n.deleted_at IS NULL
      AND c.text ILIKE ${pattern}
    LIMIT ${SEARCH_CHUNK_LIMIT}
  `;
  return rowIds(rows);
}

async function searchChunkIds(userId: string, query: string): Promise<string[]> {
  let chunkIds: string[];
  try {
    const vector = await embedText(query);
    const hits = await searchChunkVectors({
      userId,
      vector,
      limit: SEARCH_CHUNK_LIMIT,
    });
    chunkIds = hits.map((hit) => hit.chunkId);
  } catch (error) {
    logger.warn("quiz semantic search unavailable, using keyword match", {
      error: error instanceof Error ? error.message : String(error),
    });
    return keywordChunkIds(userId, query);
  }
  if (chunkIds.length === 0) return [];

  const rows = await sql<IdRow[]>`
    SELECT c.id
    FROM app.chunks c
    JOIN app.notes n ON n.note_id = c.document_id
    WHERE c.user_id = ${userId}::uuid
      AND c.id = ANY(${chunkIds}::uuid[])
      AND n.deleted_at IS NULL
  `;
  const available = new Set(rowIds(rows));
  return chunkIds.filter((id) => available.has(id));
}

/** Resolve a session filter to the live chunks of the user's non-deleted notes. */
export async function resolveChunkIds(
  userId: string,
  filter: QuizSessionFilter,
): Promise<string[]> {
  switch (filter.filterType) {
    case "course": {
      const rows = await sql<IdRow[]>`
        SELECT c.id FROM app.chunks c
        JOIN app.notes n ON c.document_id = n.note_id
        WHERE c.user_id = ${userId}::uuid
          AND n.canvas_course_id = ${filter.filterValue}::bigint
          AND n.deleted_at IS NULL
      `;
      return rowIds(rows);
    }
    case "module": {
      const rows = await sql<IdRow[]>`
        SELECT c.id FROM app.chunks c
        JOIN app.notes n ON c.document_id = n.note_id
        WHERE c.user_id = ${userId}::uuid
          AND n.canvas_module_id = ${filter.filterValue}::bigint
          AND n.deleted_at IS NULL
      `;
      return rowIds(rows);
    }
    case "note":
      return liveChunkIdsForNotes(userId, filter.filterValue);
    case "search":
      return searchChunkIds(userId, filter.filterValue);
    case "chat_session": {
      const messages = await sql<ChatMessageRow[]>`
        SELECT cm.sources FROM app.chat_messages cm
        JOIN app.chat_sessions cs ON cs.id = cm.session_id
        WHERE cm.session_id = ${filter.filterValue}::uuid
          AND cm.sources IS NOT NULL
          AND cs.user_id = ${userId}::uuid
      `;
      const noteIds = new Set(
        messages.flatMap(({ sources }) => sourceNoteIds(sources)),
      );
      if (noteIds.size === 0) return [];
      return liveChunkIdsForNotes(userId, [...noteIds]);
    }
    case "all": {
      const rows = await sql<IdRow[]>`
        SELECT c.id FROM app.chunks c
        JOIN app.notes n ON c.document_id = n.note_id
        WHERE c.user_id = ${userId}::uuid
          AND n.deleted_at IS NULL
      `;
      return rowIds(rows);
    }
  }
}

/**
 * Bucket the cards behind `chunkIds` by FSRS state. Archived courses are left
 * out, and chunks with no card yet are reported so generation can cover them.
 */
export async function getSessionCandidates(
  userId: string,
  chunkIds: string[],
  now = new Date(),
): Promise<SessionCandidates> {
  if (chunkIds.length === 0) {
    return { dueCards: [], newCards: [], retentionCards: [], uncoveredChunkIds: [] };
  }

  const [cards, activeChunks] = await Promise.all([
    sql<Array<CandidateCard & { chunk_id: string }>>`
      SELECT qc.id, qc.due, qc.state, qc.last_review, qq.chunk_id
      FROM app.quiz_cards qc
      JOIN app.quiz_questions qq ON qc.question_id = qq.id
      JOIN app.chunks c ON c.id = qq.chunk_id
      JOIN app.notes n ON n.note_id = c.document_id
      LEFT JOIN app.user_course_settings ucs
        ON ucs.user_id = ${userId}::uuid
        AND ucs.canvas_course_id = n.canvas_course_id
      WHERE qc.user_id = ${userId}::uuid
        AND qq.chunk_id = ANY(${chunkIds}::uuid[])
        AND (ucs.is_active IS NULL OR ucs.is_active = true)
    `,
    sql<IdRow[]>`
      SELECT c.id
      FROM app.chunks c
      JOIN app.notes n ON n.note_id = c.document_id
      LEFT JOIN app.user_course_settings ucs
        ON ucs.user_id = ${userId}::uuid
        AND ucs.canvas_course_id = n.canvas_course_id
      WHERE c.user_id = ${userId}::uuid
        AND c.id = ANY(${chunkIds}::uuid[])
        AND n.deleted_at IS NULL
        AND (ucs.is_active IS NULL OR ucs.is_active = true)
    `,
  ]);

  const nowMs = now.getTime();
  const dueCards: CandidateCard[] = [];
  const newCards: CandidateCard[] = [];
  const retentionCards: CandidateCard[] = [];
  for (const card of cards) {
    if (card.state === "new") {
      newCards.push(card);
    } else if (time(card.due) <= nowMs) {
      dueCards.push(card);
    } else if (
      card.state === "review" &&
      card.last_review !== null &&
      nowMs - time(card.last_review) >= RETENTION_MIN_AGE_MS
    ) {
      retentionCards.push(card);
    }
  }

  const covered = new Set(cards.map(({ chunk_id }) => chunk_id));
  const uncoveredChunkIds = rowIds(activeChunks).filter((id) => !covered.has(id));

  return { dueCards, newCards, retentionCards, uncoveredChunkIds };
}
