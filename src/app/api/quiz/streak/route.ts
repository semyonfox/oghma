import { NextResponse } from "next/server";
import { requireAuth, withErrorHandler } from "@/lib/api-error";
import sql from "@/database/pgsql";

// streaks only advance through answer submissions, once a round is finished,
// so there is deliberately no write endpoint here
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
