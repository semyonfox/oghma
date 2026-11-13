import { NextResponse, type NextRequest } from "next/server";
import {
  parseJsonObject,
  requireAuth,
  requireValidId,
  type RouteParamsContext,
  tracedError,
  withErrorHandler,
} from "@/lib/api-error";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limiter";
import {
  generateQuizAssist,
  isQuizAssistMode,
  QuizAssistUnavailableError,
} from "@/lib/quiz/assist";
import { normalizeQuizQuestion } from "@/lib/quiz/normalize-question";
import type { QuestionType } from "@/lib/quiz/types";

interface AssistQuestionRow {
  question_text: string;
  question_type: QuestionType;
  // stored jsonb comes in several historical shapes
  options: unknown;
  correct_answer: string;
  explanation: string;
  source_text: string | null;
}

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: RouteParamsContext<{ id: string }>) => {
    const user = await requireAuth();
    const questionId = requireValidId((await params).id, "question ID");

    const { mode } = await parseJsonObject(request, 1024);
    if (!isQuizAssistMode(mode)) return tracedError("Invalid mode", 400);

    const limited = await checkRateLimit("quiz-assist", user.user_id);
    if (limited) return limited;

    const [row] = await sql<AssistQuestionRow[]>`
      SELECT q.question_text, q.question_type, q.options, q.correct_answer,
             q.explanation, c.text AS source_text
      FROM app.quiz_questions q
      LEFT JOIN app.chunks c ON c.id = q.chunk_id AND c.user_id = q.user_id
      WHERE q.id = ${questionId}::uuid AND q.user_id = ${user.user_id}::uuid
    `;
    const question = normalizeQuizQuestion(row ?? null);
    if (!question) return tracedError("Not found", 404);

    try {
      const text = await generateQuizAssist(mode, question, question.source_text);
      // an empty reply or a hint that gave the answer away is not worth showing
      if (!text) return tracedError("No useful reply", 502);
      return NextResponse.json({ text });
    } catch (error) {
      if (error instanceof QuizAssistUnavailableError) {
        return tracedError("AI is not configured", 503);
      }
      logger.warn("quiz assist failed", {
        mode,
        error: error instanceof Error ? error.message : String(error),
      });
      return tracedError("AI request failed", 502);
    }
  },
);
