import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { withErrorHandler, tracedError } from '@/lib/api-error';
import sql from '@/database/pgsql.js';

export const GET = withErrorHandler(async () => {
    const user = await validateSession();
    if (!user) return tracedError('Unauthorized', 401);

    const userId = user.user_id;

    const courses = await sql`
        SELECT
            n.canvas_course_id,
            MAX(n.title) as course_name,
            COUNT(DISTINCT qc.id)::int as total_cards,
            COUNT(DISTINCT qc.id) FILTER (WHERE qc.due <= now())::int as due_count,
            COUNT(DISTINCT qc.id) FILTER (WHERE qc.state = 'review' AND qc.stability > 7)::int as mastered_count
        FROM app.quiz_questions qq
        JOIN app.quiz_cards qc ON qc.question_id = qq.id
        JOIN app.notes n ON qq.note_id = n.note_id
        WHERE qq.user_id = ${userId}::uuid
          AND n.canvas_course_id IS NOT NULL
        GROUP BY n.canvas_course_id
        ORDER BY due_count DESC
    `;

    const result = courses.map((c: any) => ({
        courseId: c.canvas_course_id,
        courseName: c.course_name,
        totalCards: c.total_cards,
        dueCount: c.due_count,
        mastery: c.total_cards > 0 ? Math.round((c.mastered_count / c.total_cards) * 100) : 0,
    }));

    return NextResponse.json({ courses: result });
});
