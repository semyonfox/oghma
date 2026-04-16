import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { withErrorHandler, tracedError } from '@/lib/api-error';
import sql from '@/database/pgsql.js';

export const GET = withErrorHandler(async (request) => {
    const user = await validateSession();
    if (!user) return tracedError('Unauthorized', 401);

    const userId = user.user_id;
    const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "1";

    const courses = await sql`
        SELECT
            n.canvas_course_id,
            COALESCE(
                (SELECT f.title FROM app.notes f
                 WHERE f.user_id = ${userId}::uuid
                   AND f.canvas_course_id = n.canvas_course_id
                   AND f.is_folder = true
                   AND f.canvas_module_id IS NULL
                   AND f.canvas_assignment_id IS NULL
                   AND f.deleted_at IS NULL
                 ORDER BY f.created_at ASC
                 LIMIT 1),
                MAX(n.title)
            ) as course_name,
            COUNT(DISTINCT qc.id)::int as total_cards,
            COUNT(DISTINCT qc.id) FILTER (WHERE qc.due <= now())::int as due_count,
            COUNT(DISTINCT qc.id) FILTER (WHERE qc.state = 'review' AND qc.stability > 7)::int as mastered_count,
            COALESCE(ucs.is_active, true) as is_active
        FROM app.notes n
        LEFT JOIN app.quiz_questions qq ON qq.note_id = n.note_id AND qq.user_id = ${userId}::uuid
        LEFT JOIN app.quiz_cards qc ON qc.question_id = qq.id AND qc.user_id = ${userId}::uuid
        LEFT JOIN app.user_course_settings ucs
          ON ucs.user_id = ${userId}::uuid
          AND ucs.canvas_course_id = n.canvas_course_id
        WHERE n.user_id = ${userId}::uuid
          AND n.canvas_course_id IS NOT NULL
          AND n.deleted_at IS NULL
          ${includeArchived ? sql`` : sql`AND (ucs.is_active IS NULL OR ucs.is_active = true)`}
          AND EXISTS (
              SELECT 1 FROM app.chunks c
              WHERE c.document_id = n.note_id AND c.user_id = ${userId}::uuid
          )
        GROUP BY n.canvas_course_id, ucs.is_active
        ORDER BY due_count DESC, total_cards DESC
    `;

    const result = courses.map((c: any) => ({
        courseId: c.canvas_course_id,
        courseName: c.course_name,
        totalCards: c.total_cards,
        dueCount: c.due_count,
        mastery: c.total_cards > 0 ? Math.round((c.mastered_count / c.total_cards) * 100) : 0,
        isActive: c.is_active,
    }));

    return NextResponse.json({ courses: result });
});
