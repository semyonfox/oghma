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
    dueCount -= overflow - reduceFromRetention - reduceFromNew;
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
      const messages = await sql`
                SELECT sources FROM app.chat_messages
                WHERE session_id = ${sessionId}::uuid
                  AND sources IS NOT NULL
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
                SELECT id FROM app.chunks
                WHERE user_id = ${userId}::uuid
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
