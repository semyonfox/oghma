import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { withErrorHandler, tracedError } from '@/lib/api-error';
import sql from '@/database/pgsql.js';

export const GET = withErrorHandler(async () => {
    const user = await validateSession();
    if (!user) return tracedError('Unauthorized', 401);

    const userId = user.user_id;

    const [{ count: dueCount }] = await sql`
        SELECT COUNT(*)::int as count FROM app.quiz_cards
        WHERE user_id = ${userId}::uuid AND due <= now()
    `;

    const [{ count: totalCards }] = await sql`
        SELECT COUNT(*)::int as count FROM app.quiz_cards
        WHERE user_id = ${userId}::uuid
    `;

    const [{ count: masteredCount }] = await sql`
        SELECT COUNT(*)::int as count FROM app.quiz_cards
        WHERE user_id = ${userId}::uuid AND state = 'review' AND stability > 7
    `;
    const mastery = totalCards > 0 ? Math.round((masteredCount / totalCards) * 100) : 0;

    const [{ count: reviewedToday }] = await sql`
        SELECT COUNT(*)::int as count FROM app.quiz_reviews
        WHERE user_id = ${userId}::uuid AND created_at >= CURRENT_DATE
    `;

    const [{ total: weekTotal, correct: weekCorrect }] = await sql`
        SELECT
            COUNT(*)::int as total,
            COUNT(*) FILTER (WHERE was_correct)::int as correct
        FROM app.quiz_reviews
        WHERE user_id = ${userId}::uuid AND created_at >= now() - interval '7 days'
    `;
    const weekAccuracy = weekTotal > 0 ? Math.round((weekCorrect / weekTotal) * 100) : 0;

    const streakRows = await sql`
        SELECT * FROM app.user_streaks WHERE user_id = ${userId}::uuid
    `;
    const streak = streakRows[0] || { current_streak: 0, longest_streak: 0 };

    const [{ has_content }] = await sql`
        SELECT EXISTS(
            SELECT 1 FROM app.chunks WHERE user_id = ${userId}::uuid LIMIT 1
        ) as has_content
    `;

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
