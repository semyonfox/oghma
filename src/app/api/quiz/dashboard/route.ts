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
                COUNT(*)::int as total_cards,
                COUNT(*) FILTER (WHERE due <= now())::int as due_count,
                COUNT(*) FILTER (WHERE state = 'review' AND stability > 7)::int as mastered_count
            FROM app.quiz_cards
            WHERE user_id = ${userId}::uuid
        `,
        sql`
            SELECT
                COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int as reviewed_today,
                COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::int as week_total,
                COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days' AND was_correct)::int as week_correct
            FROM app.quiz_reviews
            WHERE user_id = ${userId}::uuid
        `,
        sql`SELECT * FROM app.user_streaks WHERE user_id = ${userId}::uuid`,
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
