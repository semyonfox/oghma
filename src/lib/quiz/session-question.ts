import sql from "@/database/pgsql";
import { normalizeQuizQuestion } from "./normalize-question";
import type { BloomLevel, QuestionType, QuizSessionQuestion } from "./types";

interface SessionQuestionRow {
  card_id: string;
  id: string;
  question_type: QuestionType;
  bloom_level: BloomLevel;
  question_text: string;
  options: unknown;
  correct_answer: string;
  explanation: string | null;
}

interface CardIdRow {
  id: string;
}

export interface PositionedSessionQuestion {
  index: number;
  question: QuizSessionQuestion;
}

function toSessionQuestion(row: SessionQuestionRow): QuizSessionQuestion {
  const normalized = normalizeQuizQuestion(row);
  return {
    id: row.id,
    card_id: row.card_id,
    question_type: row.question_type,
    bloom_level: row.bloom_level,
    question_text: normalized?.question_text ?? "",
    options: normalized?.options ?? null,
    correct_answer: normalized?.correct_answer ?? "",
    explanation: normalized?.explanation ?? "",
  };
}

// only the fields the session UI renders; ownership columns stay server-side
export async function loadSessionQuestion(
  userId: string,
  cardId: string,
): Promise<QuizSessionQuestion | null> {
  const [row] = await sql<SessionQuestionRow[]>`
    SELECT qc.id AS card_id, qq.id, qq.question_type, qq.bloom_level,
           qq.question_text, qq.options, qq.correct_answer, qq.explanation
    FROM app.quiz_cards qc
    JOIN app.quiz_questions qq ON qq.id = qc.question_id
    WHERE qc.id = ${cardId}::uuid AND qc.user_id = ${userId}::uuid
  `;
  return row ? toSessionQuestion(row) : null;
}

/**
 * Session card lists are snapshots, so a card can disappear when its note is
 * deleted mid-session. Walk forward to the first card that still exists rather
 * than ending the session early.
 */
export async function findSessionQuestionFrom(
  userId: string,
  cardIds: string[],
  fromIndex: number,
): Promise<PositionedSessionQuestion | null> {
  const remaining = cardIds.slice(Math.max(0, fromIndex));
  if (remaining.length === 0) return null;

  const existing = await sql<CardIdRow[]>`
    SELECT id FROM app.quiz_cards
    WHERE user_id = ${userId}::uuid AND id = ANY(${remaining}::uuid[])
  `;
  const existingIds = new Set(existing.map(({ id }) => id));

  for (let index = Math.max(0, fromIndex); index < cardIds.length; index++) {
    if (!existingIds.has(cardIds[index])) continue;
    const question = await loadSessionQuestion(userId, cardIds[index]);
    if (question) return { index, question };
  }
  return null;
}
