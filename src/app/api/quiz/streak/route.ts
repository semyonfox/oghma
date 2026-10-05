import { NextResponse } from "next/server";
import { requireAuth, withErrorHandler } from "@/lib/api-error";
import { advanceQuizStreak } from "@/lib/quiz/streak";
import sql from "@/database/pgsql";

export const GET = withErrorHandler(async () => {
  const user = await requireAuth();

  const rows = await sql`
        SELECT current_streak, longest_streak, last_review_date, total_review_days, streak_milestones
        FROM app.user_streaks WHERE user_id = ${user.user_id}::uuid
    `;

  return NextResponse.json(
    rows[0] || {
      current_streak: 0,
      longest_streak: 0,
      last_review_date: null,
      total_review_days: 0,
      streak_milestones: [],
    },
  );
});

export const POST = withErrorHandler(async () => {
  const user = await requireAuth();

  const { current_streak, newMilestone } = await advanceQuizStreak(user.user_id);
  return NextResponse.json({ current_streak, newMilestone });
});
