import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { withErrorHandler, tracedError } from '@/lib/api-error';
import sql from '@/database/pgsql.js';

export const GET = withErrorHandler(async () => {
    const user = await validateSession();
    if (!user) return tracedError('Unauthorized', 401);

    const userId = user.user_id;

    const [
        [{ due_count: dueCount, total_cards: totalCards, mastered_count: masteredCount }],
        [{ reviewed_today: reviewedToday, week_total: weekTotal, week_correct: weekCorrect }],
        streakRows,
        [{ has_content }],
    ] = await Promise.all([
        sql`
            SELECT
                COUNT(DISTINCT qc.id)::int as total_cards,
                COUNT(DISTINCT qc.id) FILTER (WHERE qc.due <= now())::int as due_count,
                COUNT(DISTINCT qc.id) FILTER (WHERE qc.state = 'review' AND qc.stability > 7)::int as mastered_count
            FROM app.quiz_cards qc
            JOIN app.quiz_questions qq ON qq.id = qc.question_id
            JOIN app.chunks c ON c.id = qq.chunk_id
            JOIN app.notes n ON n.note_id = c.document_id
            LEFT JOIN app.user_course_settings ucs
              ON ucs.user_id = ${userId}::uuid
              AND ucs.canvas_course_id = n.canvas_course_id
            WHERE qc.user_id = ${userId}::uuid
              AND n.deleted = 0
              AND (n.canvas_course_id IS NULL OR ucs.is_active IS NULL OR ucs.is_active = true)
        `,
        sql`
            SELECT
                COUNT(DISTINCT qr.id) FILTER (WHERE qr.created_at >= CURRENT_DATE)::int as reviewed_today,
                COUNT(DISTINCT qr.id) FILTER (WHERE qr.created_at >= now() - interval '7 days')::int as week_total,
                COUNT(DISTINCT qr.id) FILTER (WHERE qr.created_at >= now() - interval '7 days' AND qr.was_correct)::int as week_correct
            FROM app.quiz_reviews qr
            JOIN app.quiz_cards qc ON qc.id = qr.card_id
            JOIN app.quiz_questions qq ON qq.id = qc.question_id
            JOIN app.chunks c ON c.id = qq.chunk_id
            JOIN app.notes n ON n.note_id = c.document_id
            LEFT JOIN app.user_course_settings ucs
              ON ucs.user_id = ${userId}::uuid
              AND ucs.canvas_course_id = n.canvas_course_id
            WHERE qr.user_id = ${userId}::uuid
              AND n.deleted = 0
              AND (n.canvas_course_id IS NULL OR ucs.is_active IS NULL OR ucs.is_active = true)
        `,
        sql`SELECT current_streak, longest_streak FROM app.user_streaks WHERE user_id = ${userId}::uuid`,
        sql`
            SELECT EXISTS(
                SELECT 1 FROM app.chunks WHERE user_id = ${userId}::uuid LIMIT 1
            ) as has_content
        `,
    ]);

    const mastery = totalCards > 0 ? Math.round((masteredCount / totalCards) * 100) : 0;
    const weekAccuracy = weekTotal > 0 ? Math.round((weekCorrect / weekTotal) * 100) : 0;
    const streak = streakRows[0] || { current_streak: 0, longest_streak: 0 };

    return NextResponse.json({
        dueCount,
        totalCards,
        mastery,
        reviewedToday,
        weekAccuracy,
        currentStreak: streak.current_streak,
        longestStreak: streak.longest_streak,
        hasContent: has_content,
    });
});
