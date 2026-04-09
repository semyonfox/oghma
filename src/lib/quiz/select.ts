import { embedText } from "@/lib/embedText";
import sql from "@/database/pgsql.js";
import type { FilterType } from "./types";
import { SESSION_DEFAULTS } from "./types";

interface DueCard {
  id: string;
  due: string;
}

interface SelectionResult {
  due: DueCard[];
  newChunks: string[];
  retention: DueCard[];
}

// pure selection logic — testable without DB
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
    dueCount = Math.max(0, dueCount - (overflow - reduceFromRetention - reduceFromNew));
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

  // sort due cards by urgency (most overdue first)
  const sortedDue = [...dueCards].sort(
    (a, b) => new Date(a.due).getTime() - new Date(b.due).getTime(),
  );

  // shuffle mastered for random retention checks
  const shuffledMastered = [...masteredCards].sort(() => Math.random() - 0.5);

  return {
    due: sortedDue.slice(0, dueCount),
    newChunks: uncoveredChunkIds.slice(0, newCount),
    retention: shuffledMastered.slice(0, retentionCount),
  };
}

// resolve filter to chunk IDs from the database
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
                  AND n.canvas_course_id = ${filterValue as number}
                  AND n.deleted = 0
            `;
      return rows.map((r: any) => r.id);
    }
    case "module": {
      const rows = await sql`
                SELECT c.id FROM app.chunks c
                JOIN app.notes n ON c.document_id = n.note_id
                WHERE c.user_id = ${userId}::uuid
                  AND n.canvas_module_id = ${filterValue as number}
                  AND n.deleted = 0
            `;
      return rows.map((r: any) => r.id);
    }
    case "note": {
      const noteIds = filterValue as string[];
      const rows = await sql`
                SELECT id FROM app.chunks
                WHERE user_id = ${userId}::uuid
                  AND document_id = ANY(${noteIds}::uuid[])
            `;
      return rows.map((r: any) => r.id);
    }
    case "search": {
      const query = filterValue as string;
      const vector = await embedText(query);
      const rows = await sql`
                SELECT c.id
                FROM app.embeddings e
                JOIN app.chunks c ON c.id = e.chunk_id
                WHERE c.user_id = ${userId}::uuid
                ORDER BY e.embedding <=> ${JSON.stringify(vector)}::vector
                LIMIT 30
            `;
      return rows.map((r: any) => r.id);
    }
    case "chat_session": {
      const sessionId = filterValue as string;
      // join through chat_sessions to enforce ownership (C3)
      const messages = await sql`
                SELECT cm.sources FROM app.chat_messages cm
                JOIN app.chat_sessions cs ON cs.id = cm.session_id
                WHERE cm.session_id = ${sessionId}::uuid
                  AND cm.sources IS NOT NULL
                  AND cs.user_id = ${userId}::uuid
            `;
      const noteIds = new Set<string>();
      for (const msg of messages) {
        const sources = msg.sources as { id: string }[];
        sources?.forEach((s) => noteIds.add(s.id));
      }
      if (noteIds.size === 0) return [];
      const rows = await sql`
                SELECT id FROM app.chunks
                WHERE user_id = ${userId}::uuid
                  AND document_id = ANY(${[...noteIds]}::uuid[])
            `;
      return rows.map((r: any) => r.id);
    }
    case "all": {
      const rows = await sql`
                SELECT c.id FROM app.chunks c
                JOIN app.notes n ON c.document_id = n.note_id
                WHERE c.user_id = ${userId}::uuid
                  AND n.deleted = 0
            `;
      return rows.map((r: any) => r.id);
    }
    default:
      return [];
  }
}

// get due cards, uncovered chunks, and mastered cards for a session
export async function getSessionCandidates(
  userId: string,
  chunkIds: string[],
): Promise<{
  dueCards: any[];
  uncoveredChunkIds: string[];
  masteredCards: any[];
}> {
  if (chunkIds.length === 0) {
    return { dueCards: [], uncoveredChunkIds: [], masteredCards: [] };
  }

  // get all existing cards for these chunks
  const existingCards = await sql`
        SELECT qc.id, qc.due, qc.state, qc.question_id, qq.chunk_id
        FROM app.quiz_cards qc
        JOIN app.quiz_questions qq ON qc.question_id = qq.id
        WHERE qc.user_id = ${userId}::uuid
          AND qq.chunk_id = ANY(${chunkIds}::uuid[])
    `;

  const now = new Date();
  const dueCards = existingCards.filter(
    (c: any) => new Date(c.due) <= now && c.state !== "new",
  );
  const masteredCards = existingCards.filter(
    (c: any) => new Date(c.due) > now && c.state === "review",
  );
  const newCards = existingCards.filter((c: any) => c.state === "new");

  // chunks that have no questions yet
  const coveredChunkIds = new Set(existingCards.map((c: any) => c.chunk_id));
  const uncoveredChunkIds = chunkIds.filter((id) => !coveredChunkIds.has(id));

  // include new (unreviewed) cards as due
  const allDue = [...dueCards, ...newCards];

  return { dueCards: allDue, uncoveredChunkIds, masteredCards };
}

/**
 * Dynamically select the next question for an infinite session.
 * Priority order:
 * 1. Due cards (overdue reviews) — most urgent
 * 2. New (unreviewed) cards — expand coverage
 * 3. Uncovered chunks — generate new question on the fly
 * 4. Mastered cards — retention review
 * Returns the card ID to show next, or a chunk ID that needs generation.
 */
export async function selectNextQuestion(
  userId: string,
  chunkIds: string[],
  answeredCardIds: string[],
): Promise<
  | { type: "card"; cardId: string }
  | { type: "generate"; chunkId: string }
  | null
> {
  if (chunkIds.length === 0) return null;

  const answeredSet =
    answeredCardIds.length > 0
      ? answeredCardIds
      : ["00000000-0000-0000-0000-000000000000"];

  // 1. due cards (overdue, not just answered)
  const dueCards = await sql`
    SELECT qc.id FROM app.quiz_cards qc
    JOIN app.quiz_questions qq ON qc.question_id = qq.id
    WHERE qc.user_id = ${userId}::uuid
      AND qq.chunk_id = ANY(${chunkIds}::uuid[])
      AND qc.due <= now()
      AND qc.id != ALL(${answeredSet}::uuid[])
    ORDER BY qc.due ASC
    LIMIT 1
  `;
  if (dueCards.length > 0) return { type: "card", cardId: dueCards[0].id };

  // 2. new (unreviewed) cards
  const newCards = await sql`
    SELECT qc.id FROM app.quiz_cards qc
    JOIN app.quiz_questions qq ON qc.question_id = qq.id
    WHERE qc.user_id = ${userId}::uuid
      AND qq.chunk_id = ANY(${chunkIds}::uuid[])
      AND qc.state = 'new'
      AND qc.id != ALL(${answeredSet}::uuid[])
    ORDER BY qc.created_at ASC
    LIMIT 1
  `;
  if (newCards.length > 0) return { type: "card", cardId: newCards[0].id };

  // 3. uncovered chunks (need question generation)
  const uncovered = await sql`
    SELECT c.id FROM app.chunks c
    WHERE c.user_id = ${userId}::uuid
      AND c.id = ANY(${chunkIds}::uuid[])
      AND NOT EXISTS (
        SELECT 1 FROM app.quiz_questions qq
        WHERE qq.chunk_id = c.id AND qq.user_id = ${userId}::uuid
      )
    ORDER BY random()
    LIMIT 1
  `;
  if (uncovered.length > 0)
    return { type: "generate", chunkId: uncovered[0].id };

  // 4. mastered cards for retention (review state, not recently answered)
  const retentionCards = await sql`
    SELECT qc.id FROM app.quiz_cards qc
    JOIN app.quiz_questions qq ON qc.question_id = qq.id
    WHERE qc.user_id = ${userId}::uuid
      AND qq.chunk_id = ANY(${chunkIds}::uuid[])
      AND qc.state = 'review'
      AND qc.id != ALL(${answeredSet}::uuid[])
    ORDER BY random()
    LIMIT 1
  `;
  if (retentionCards.length > 0)
    return { type: "card", cardId: retentionCards[0].id };

  // 5. cross-year cycling — questions from previous years of the same course
  // chunks belong to content notes which have canvas_course_id; course folders
  // share the same title across years (e.g. "CT216-Software-Engineering-1")
  // so we match folder titles to find sibling course IDs from other years
  const relatedCards = await sql`
    WITH scope_course_ids AS (
      SELECT DISTINCT n.canvas_course_id
      FROM app.chunks c
      JOIN app.notes n ON c.document_id = n.note_id
      WHERE c.id = ANY(${chunkIds}::uuid[])
        AND n.canvas_course_id IS NOT NULL
    ),
    course_folders AS (
      SELECT DISTINCT title, canvas_course_id
      FROM app.notes
      WHERE user_id = ${userId}::uuid
        AND is_folder = true
        AND deleted = 0
        AND canvas_course_id IN (SELECT canvas_course_id FROM scope_course_ids)
        AND canvas_module_id IS NULL
    ),
    sibling_course_ids AS (
      SELECT DISTINCT n2.canvas_course_id
      FROM course_folders cf
      JOIN app.notes n2 ON n2.title = cf.title
        AND n2.canvas_course_id != cf.canvas_course_id
        AND n2.is_folder = true
        AND n2.canvas_module_id IS NULL
        AND n2.deleted = 0
        AND n2.user_id = ${userId}::uuid
    )
    SELECT qc.id FROM app.quiz_cards qc
    JOIN app.quiz_questions qq ON qc.question_id = qq.id
    JOIN app.notes n ON qq.note_id = n.note_id
    WHERE qc.user_id = ${userId}::uuid
      AND n.canvas_course_id IN (SELECT canvas_course_id FROM sibling_course_ids)
      AND qc.id != ALL(${answeredSet}::uuid[])
    ORDER BY random()
    LIMIT 1
  `;
  if (relatedCards.length > 0)
    return { type: "card", cardId: relatedCards[0].id };

  return null;
}
