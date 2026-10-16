import sql from "@/database/pgsql";
import { DEFAULT_TIME_ZONE } from "./time-zone";
import type { QuizDashboardCourse, QuizDashboardSummary } from "./types";

// FSRS stability is in days; a card that holds for over a week counts as mastered
const MASTERED_STABILITY_DAYS = 7;

interface CardCountsRow {
  total_cards: number;
  due_count: number;
  mastered_count: number;
}

interface ReviewCountsRow {
  reviewed_today: number;
  week_total: number;
  week_correct: number;
}

interface StreakRow {
  current_streak: number;
  longest_streak: number;
}

interface ContentRow {
  has_content: boolean;
}

interface CourseRow extends CardCountsRow {
  canvas_course_id: string | number;
  course_name: string;
  is_active: boolean;
}

function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/**
 * Card counts only include cards whose source chunk is still indexed, matching
 * what a session can actually serve. Review counts are plain history, so they
 * read quiz_reviews alone and stay correct after notes are edited or archived.
 */
export async function getQuizDashboardSummary(
  userId: string,
  timeZone = DEFAULT_TIME_ZONE,
): Promise<QuizDashboardSummary> {
  const [[cards], [reviews], [streak], [content]] = await Promise.all([
    sql<CardCountsRow[]>`
      SELECT
        COUNT(*)::int AS total_cards,
        COUNT(*) FILTER (WHERE qc.due <= now())::int AS due_count,
        COUNT(*) FILTER (
          WHERE qc.state = 'review' AND qc.stability > ${MASTERED_STABILITY_DAYS}
        )::int AS mastered_count
      FROM app.quiz_cards qc
      JOIN app.quiz_questions qq ON qq.id = qc.question_id
      JOIN app.chunks c ON c.id = qq.chunk_id
      JOIN app.notes n ON n.note_id = c.document_id
      LEFT JOIN app.user_course_settings ucs
        ON ucs.user_id = ${userId}::uuid
        AND ucs.canvas_course_id = n.canvas_course_id
      WHERE qc.user_id = ${userId}::uuid
        AND n.deleted_at IS NULL
        AND (ucs.is_active IS NULL OR ucs.is_active = true)
    `,
    sql<ReviewCountsRow[]>`
      WITH bounds AS (
        SELECT
          date_trunc('day', now() AT TIME ZONE ${timeZone}) AT TIME ZONE ${timeZone} AS day_start,
          now() - interval '7 days' AS week_start
      )
      SELECT
        COUNT(*) FILTER (WHERE qr.created_at >= b.day_start)::int AS reviewed_today,
        COUNT(*) FILTER (WHERE qr.created_at >= b.week_start)::int AS week_total,
        COUNT(*) FILTER (
          WHERE qr.created_at >= b.week_start AND qr.was_correct
        )::int AS week_correct
      FROM bounds b
      LEFT JOIN app.quiz_reviews qr
        ON qr.user_id = ${userId}::uuid
        AND qr.created_at >= LEAST(b.day_start, b.week_start)
    `,
    sql<StreakRow[]>`
      SELECT current_streak, longest_streak
      FROM app.user_streaks WHERE user_id = ${userId}::uuid
    `,
    sql<ContentRow[]>`
      SELECT EXISTS(
        SELECT 1 FROM app.chunks WHERE user_id = ${userId}::uuid
      ) AS has_content
    `,
  ]);

  return {
    dueCount: cards.due_count,
    totalCards: cards.total_cards,
    mastery: percent(cards.mastered_count, cards.total_cards),
    reviewedToday: reviews.reviewed_today,
    weekAccuracy: percent(reviews.week_correct, reviews.week_total),
    currentStreak: streak?.current_streak ?? 0,
    longestStreak: streak?.longest_streak ?? 0,
    hasContent: content.has_content,
  };
}

/**
 * One row per Canvas course with indexed notes. Cards are counted through live
 * chunks, the same way the summary and session selection count them.
 */
export async function getQuizDashboardCourses(
  userId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<QuizDashboardCourse[]> {
  const rows = await sql<CourseRow[]>`
    WITH course_notes AS (
      SELECT n.note_id, n.canvas_course_id
      FROM app.notes n
      WHERE n.user_id = ${userId}::uuid
        AND n.canvas_course_id IS NOT NULL
        AND n.deleted_at IS NULL
    ),
    indexed_courses AS (
      SELECT DISTINCT cn.canvas_course_id
      FROM course_notes cn
      WHERE EXISTS (
        SELECT 1 FROM app.chunks c
        WHERE c.document_id = cn.note_id AND c.user_id = ${userId}::uuid
      )
    ),
    course_cards AS (
      SELECT
        cn.canvas_course_id,
        COUNT(*)::int AS total_cards,
        COUNT(*) FILTER (WHERE qc.due <= now())::int AS due_count,
        COUNT(*) FILTER (
          WHERE qc.state = 'review' AND qc.stability > ${MASTERED_STABILITY_DAYS}
        )::int AS mastered_count
      FROM course_notes cn
      JOIN app.chunks c
        ON c.document_id = cn.note_id AND c.user_id = ${userId}::uuid
      JOIN app.quiz_questions qq
        ON qq.chunk_id = c.id AND qq.user_id = ${userId}::uuid
      JOIN app.quiz_cards qc
        ON qc.question_id = qq.id AND qc.user_id = ${userId}::uuid
      GROUP BY cn.canvas_course_id
    )
    SELECT
      ic.canvas_course_id,
      COALESCE(
        (SELECT NULLIF(BTRIM(f.title), '') FROM app.notes f
         WHERE f.user_id = ${userId}::uuid
           AND f.canvas_course_id = ic.canvas_course_id
           AND f.is_folder = true
           AND f.canvas_module_id IS NULL
           AND f.canvas_assignment_id IS NULL
           AND f.deleted_at IS NULL
         ORDER BY f.created_at ASC
         LIMIT 1),
        NULLIF(BTRIM(ucs.course_name), ''),
        'Course ' || ic.canvas_course_id::text
      ) AS course_name,
      COALESCE(cc.total_cards, 0) AS total_cards,
      COALESCE(cc.due_count, 0) AS due_count,
      COALESCE(cc.mastered_count, 0) AS mastered_count,
      COALESCE(ucs.is_active, true) AS is_active
    FROM indexed_courses ic
    LEFT JOIN course_cards cc ON cc.canvas_course_id = ic.canvas_course_id
    LEFT JOIN app.user_course_settings ucs
      ON ucs.user_id = ${userId}::uuid
      AND ucs.canvas_course_id = ic.canvas_course_id
    WHERE ${includeArchived}::boolean OR ucs.is_active IS NULL OR ucs.is_active = true
    ORDER BY due_count DESC, total_cards DESC
  `;

  return rows.map((course) => ({
    courseId: String(course.canvas_course_id),
    courseName: course.course_name,
    totalCards: course.total_cards,
    dueCount: course.due_count,
    mastery: percent(course.mastered_count, course.total_cards),
    isActive: course.is_active,
  }));
}
