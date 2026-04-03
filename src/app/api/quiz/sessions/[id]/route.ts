import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { cardFromDB, getNextIntervals } from "@/lib/quiz/fsrs";
import { selectNextQuestion } from "@/lib/quiz/select";
import { generateQuestion } from "@/lib/quiz/generate";
import { getCurrentBloomLevel, pickQuestionType } from "@/lib/quiz/bloom";
import sql from "@/database/pgsql.js";

export const GET = withErrorHandler(
  async (
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await validateSession();
    if (!user) return tracedError("Unauthorized", 401);

    const { id } = await params;
    const userId = user.user_id;

    const [session] = await sql`
      SELECT * FROM app.quiz_sessions
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
    `;

    if (!session) return tracedError("Session not found", 404);

    // card_ids now stores chunk IDs (the session scope)
    const scopeChunkIds: string[] = session.card_ids ?? [];

    // count questions answered in this session
    const [{ count: answeredCount }] = await sql`
      SELECT count(*)::int as count FROM app.quiz_reviews
      WHERE session_id = ${id}::uuid AND user_id = ${userId}::uuid
    `;

    // get answered card IDs to avoid repeats
    const answeredRows = await sql`
      SELECT card_id FROM app.quiz_reviews
      WHERE session_id = ${id}::uuid AND user_id = ${userId}::uuid
    `;
    const answeredCardIds = answeredRows.map((r: any) => r.card_id);

    // dynamically pick next question
    let question = null;
    if (!session.completed_at) {
      const next = await selectNextQuestion(
        userId,
        scopeChunkIds,
        answeredCardIds,
      );

      if (next?.type === "card") {
        const rows = await sql`
          SELECT qc.id as card_id, qq.*, qc.state, qc.stability, qc.difficulty,
                 qc.elapsed_days, qc.scheduled_days, qc.reps, qc.lapses, qc.due, qc.last_review
          FROM app.quiz_cards qc
          JOIN app.quiz_questions qq ON qc.question_id = qq.id
          WHERE qc.id = ${next.cardId}::uuid
        `;
        question = rows[0] ?? null;
        if (question) {
          const fsrsCard = cardFromDB(question);
          question.intervals = getNextIntervals(fsrsCard);
        }
      } else if (next?.type === "generate") {
        const [chunk] = await sql`
          SELECT c.id, c.text, c.document_id, n.title, n.canvas_course_id
          FROM app.chunks c
          JOIN app.notes n ON c.document_id = n.note_id
          WHERE c.id = ${next.chunkId}::uuid
        `;
        if (chunk) {
          const reviews = await sql`
            SELECT qq.bloom_level, qr.was_correct
            FROM app.quiz_reviews qr
            JOIN app.quiz_questions qq ON qr.question_id = qq.id
            WHERE qq.chunk_id = ${next.chunkId}::uuid AND qr.user_id = ${userId}::uuid
            ORDER BY qr.created_at ASC
          `;
          const bloomLevel = getCurrentBloomLevel(reviews);
          const questionType = pickQuestionType(bloomLevel);
          const generated = await generateQuestion(
            userId,
            chunk.document_id,
            next.chunkId,
            chunk.text,
            chunk.title || "Unknown Module",
            bloomLevel,
            questionType,
            chunk.canvas_course_id,
          );
          if (generated) {
            const rows = await sql`
              SELECT qc.id as card_id, qq.*, qc.state, qc.stability, qc.difficulty,
                     qc.elapsed_days, qc.scheduled_days, qc.reps, qc.lapses, qc.due, qc.last_review
              FROM app.quiz_cards qc
              JOIN app.quiz_questions qq ON qc.question_id = qq.id
              WHERE qq.id = ${generated.id}::uuid
            `;
            question = rows[0] ?? null;
            if (question) {
              const fsrsCard = cardFromDB(question);
              question.intervals = getNextIntervals(fsrsCard);
            }
          }
        }
      }
    }

    return NextResponse.json({
      ...session,
      currentIndex: answeredCount,
      totalQuestions: scopeChunkIds.length,
      question,
    });
  },
);

export const DELETE = withErrorHandler(
  async (
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await validateSession();
    if (!user) return tracedError("Unauthorized", 401);

    const { id } = await params;
    await sql`
      UPDATE app.quiz_sessions
      SET completed_at = now()
      WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
    `;

    return NextResponse.json({ success: true });
  },
);
