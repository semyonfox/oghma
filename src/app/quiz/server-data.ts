import "server-only";

import sql from "@/database/pgsql.js";

export interface QuizDashboardSummary {
  dueCount: number;
  totalCards: number;
  mastery: number;
  reviewedToday: number;
  weekAccuracy: number;
  currentStreak: number;
  longestStreak: number;
  hasContent: boolean;
}

export interface QuizDashboardCourse {
  courseId: number;
  courseName: string;
  totalCards: number;
  dueCount: number;
  mastery: number;
  isActive: boolean;
}

export interface QuizDashboardInitialData {
  dashboard: QuizDashboardSummary;
  courses: QuizDashboardCourse[];
}

interface QuizCourseRow {
  canvas_course_id: number;
  course_name: string;
  total_cards: number;
  due_count: number;
  mastered_count: number;
  is_active: boolean;
}

export async function getQuizDashboardData(
  userId: string,
): Promise<QuizDashboardInitialData> {
  const [cardRows, reviewRows, streakRows, contentRows, courseRows] =
    await Promise.all([
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
          AND n.deleted_at IS NULL
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
          AND n.deleted_at IS NULL
          AND (n.canvas_course_id IS NULL OR ucs.is_active IS NULL OR ucs.is_active = true)
      `,
      sql`SELECT current_streak, longest_streak FROM app.user_streaks WHERE user_id = ${userId}::uuid`,
      sql`SELECT EXISTS(SELECT 1 FROM app.chunks WHERE user_id = ${userId}::uuid LIMIT 1) as has_content`,
      sql`
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
          AND (ucs.is_active IS NULL OR ucs.is_active = true)
          AND EXISTS (
            SELECT 1 FROM app.chunks c
            WHERE c.document_id = n.note_id AND c.user_id = ${userId}::uuid
          )
        GROUP BY n.canvas_course_id, ucs.is_active
        ORDER BY due_count DESC, total_cards DESC
      `,
    ]);

  const card = cardRows[0];
  const review = reviewRows[0];
  const streak = streakRows[0] || { current_streak: 0, longest_streak: 0 };
  const totalCards = card.total_cards;

  return {
    dashboard: {
      dueCount: card.due_count,
      totalCards,
      mastery:
        totalCards > 0
          ? Math.round((card.mastered_count / totalCards) * 100)
          : 0,
      reviewedToday: review.reviewed_today,
      weekAccuracy:
        review.week_total > 0
          ? Math.round((review.week_correct / review.week_total) * 100)
          : 0,
      currentStreak: streak.current_streak,
      longestStreak: streak.longest_streak,
      hasContent: contentRows[0].has_content,
    },
    courses: (courseRows as unknown as QuizCourseRow[]).map((course) => ({
      courseId: course.canvas_course_id,
      courseName: course.course_name,
      totalCards: course.total_cards,
      dueCount: course.due_count,
      mastery:
        course.total_cards > 0
          ? Math.round((course.mastered_count / course.total_cards) * 100)
          : 0,
      isActive: course.is_active,
    })),
  };
}
