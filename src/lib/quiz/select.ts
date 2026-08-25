import { embedText } from "@/lib/embedText";
import sql from "@/database/pgsql";
import type { CardState, FilterType } from "./types";
import { SESSION_DEFAULTS } from "./types";
import { searchChunkVectors } from "@/lib/qdrant";

interface DueCard {
  id: string;
  due: string;
}

interface IdRow {
  id: string;
}

interface CardIdRow {
  card_id: string;
}

interface ExistingCardRow extends DueCard {
  state: CardState;
  question_id: string;
  chunk_id: string;
}

interface ChatMessageRow {
  sources: unknown;
}

interface SelectionResult {
  due: DueCard[];
  newChunks: string[];
  retention: DueCard[];
}

export function selectCards(
  dueCards: DueCard[],
  uncoveredChunkIds: string[],
  maxQuestions: number,
  masteredCards: DueCard[] = [],
): SelectionResult {
  if (
    dueCards.length === 0 &&
    uncoveredChunkIds.length === 0 &&
    masteredCards.length === 0
  ) {
    return { due: [], newChunks: [], retention: [] };
  }

  let dueCount = Math.min(
    Math.round(maxQuestions * SESSION_DEFAULTS.weightDue),
    dueCards.length,
  );
  let newCount = Math.min(
    Math.round(maxQuestions * SESSION_DEFAULTS.weightNew),
    uncoveredChunkIds.length,
  );
  let retentionCount = Math.min(
    Math.round(maxQuestions * SESSION_DEFAULTS.weightRetention),
    masteredCards.length,
  );

  let total = dueCount + newCount + retentionCount;
  if (total > maxQuestions) {
    const overflow = total - maxQuestions;
    const reduceFromRetention = Math.min(overflow, retentionCount);
    retentionCount -= reduceFromRetention;
    const reduceFromNew = Math.min(overflow - reduceFromRetention, newCount);
    newCount -= reduceFromNew;
    dueCount = Math.max(
      0,
      dueCount - (overflow - reduceFromRetention - reduceFromNew),
    );
    total = dueCount + newCount + retentionCount;
  }

  let remaining = maxQuestions - total;
  while (remaining > 0) {
    let allocated = false;
    if (dueCount < dueCards.length) {
      dueCount += 1;
      allocated = true;
    } else if (newCount < uncoveredChunkIds.length) {
      newCount += 1;
      allocated = true;
    } else if (retentionCount < masteredCards.length) {
      retentionCount += 1;
      allocated = true;
    }
    if (!allocated) break;
    remaining -= 1;
  }

  const sortedDue = [...dueCards].sort(
    (a, b) => new Date(a.due).getTime() - new Date(b.due).getTime(),
  );

  const shuffledMastered = [...masteredCards].sort(() => Math.random() - 0.5);

  return {
    due: sortedDue.slice(0, dueCount),
    newChunks: uncoveredChunkIds.slice(0, newCount),
    retention: shuffledMastered.slice(0, retentionCount),
  };
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

export async function resolveChunkIds(
  userId: string,
  filterType: FilterType,
  filterValue: unknown,
): Promise<string[]> {
  switch (filterType) {
    case "course": {
      const rows = await sql`
                SELECT c.id FROM app.chunks c
                JOIN app.notes n ON c.document_id = n.note_id
                WHERE c.user_id = ${userId}::uuid
                  AND n.canvas_course_id = ${String(filterValue)}::bigint
                  AND n.deleted_at IS NULL
            `;
      return rowIds(rows as IdRow[]);
    }
    case "module": {
      const rows = await sql`
                SELECT c.id FROM app.chunks c
                JOIN app.notes n ON c.document_id = n.note_id
                WHERE c.user_id = ${userId}::uuid
                  AND n.canvas_module_id = ${String(filterValue)}::bigint
                  AND n.deleted_at IS NULL
            `;
      return rowIds(rows as IdRow[]);
    }
    case "note": {
      const noteIds = filterValue as string[];
      const rows = await sql`
                SELECT c.id
                FROM app.chunks c
                JOIN app.notes n ON n.note_id = c.document_id
                WHERE c.user_id = ${userId}::uuid
                  AND c.document_id = ANY(${noteIds}::uuid[])
                  AND n.deleted_at IS NULL
            `;
      return rowIds(rows as IdRow[]);
    }
    case "search": {
      const query = filterValue as string;
      const vector = await embedText(query);
      const hits = await searchChunkVectors({
        userId,
        vector,
        limit: 30,
      });
      if (hits.length === 0) return [];

      const chunkIds = hits.map((hit) => hit.chunkId);
      const rows = await sql`
        SELECT c.id
        FROM app.chunks c
        JOIN app.notes n ON n.note_id = c.document_id
        WHERE c.user_id = ${userId}::uuid
          AND c.id = ANY(${chunkIds}::uuid[])
          AND n.deleted_at IS NULL
      `;
      const available = new Set(rowIds(rows as IdRow[]));
      return chunkIds.filter((id) => available.has(id));
    }
    case "chat_session": {
      const sessionId = filterValue as string;
      const messages = await sql`
                SELECT cm.sources FROM app.chat_messages cm
                JOIN app.chat_sessions cs ON cs.id = cm.session_id
                WHERE cm.session_id = ${sessionId}::uuid
                  AND cm.sources IS NOT NULL
                  AND cs.user_id = ${userId}::uuid
            `;
      const noteIds = new Set(
        (messages as ChatMessageRow[]).flatMap(({ sources }) => sourceNoteIds(sources)),
      );
      if (noteIds.size === 0) return [];
      const rows = await sql`
                SELECT c.id
                FROM app.chunks c
                JOIN app.notes n ON n.note_id = c.document_id
                WHERE c.user_id = ${userId}::uuid
                  AND c.document_id = ANY(${[...noteIds]}::uuid[])
                  AND n.deleted_at IS NULL
            `;
      return rowIds(rows as IdRow[]);
    }
    case "all": {
      const rows = await sql`
                SELECT c.id FROM app.chunks c
                JOIN app.notes n ON c.document_id = n.note_id
                WHERE c.user_id = ${userId}::uuid
                  AND n.deleted_at IS NULL
            `;
      return rowIds(rows as IdRow[]);
    }
    default:
      return [];
  }
}

export async function getSessionCandidates(
  userId: string,
  chunkIds: string[],
): Promise<{
  dueCards: ExistingCardRow[];
  uncoveredChunkIds: string[];
  masteredCards: ExistingCardRow[];
}> {
  if (chunkIds.length === 0) {
    return { dueCards: [], uncoveredChunkIds: [], masteredCards: [] };
  }

  const existingCards = (await sql`
        SELECT qc.id, qc.due, qc.state, qc.question_id, qq.chunk_id
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
    `) as ExistingCardRow[];

  const correctTodayRows = await sql`
    SELECT DISTINCT card_id FROM app.quiz_reviews
    WHERE user_id = ${userId}::uuid
      AND created_at >= CURRENT_DATE::timestamptz
      AND was_correct = true
  `;
  const correctTodayIds = new Set(
    (correctTodayRows as CardIdRow[]).map(({ card_id }) => card_id),
  );

  const activeChunks = (await sql`
        SELECT c.id
        FROM app.chunks c
        JOIN app.notes n ON n.note_id = c.document_id
        LEFT JOIN app.user_course_settings ucs
          ON ucs.user_id = ${userId}::uuid
          AND ucs.canvas_course_id = n.canvas_course_id
        WHERE c.user_id = ${userId}::uuid
          AND c.id = ANY(${chunkIds}::uuid[])
          AND n.deleted_at IS NULL
          AND (n.canvas_course_id IS NULL OR ucs.is_active IS NULL OR ucs.is_active = true)
    `) as IdRow[];

  const now = new Date();
  const dueCards = existingCards.filter(
    (card) =>
      new Date(card.due) <= now &&
      card.state !== "new" &&
      !correctTodayIds.has(card.id),
  );
  const masteredCards = existingCards.filter(
    (card) =>
      new Date(card.due) > now &&
      card.state === "review" &&
      !correctTodayIds.has(card.id),
  );
  const newCards = existingCards.filter((card) => card.state === "new");

  const activeChunkIds = rowIds(activeChunks);

  const coveredChunkIds = new Set(existingCards.map(({ chunk_id }) => chunk_id));
  const uncoveredChunkIds = activeChunkIds.filter((id) => !coveredChunkIds.has(id));

  const allDue = [...dueCards, ...newCards];

  return { dueCards: allDue, uncoveredChunkIds, masteredCards };
}
