import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

const MILESTONES = [7, 14, 30, 60, 90, 180, 365];

export const GET = withErrorHandler(async () => {
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

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
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

  const userId = user.user_id;
  const today = new Date().toISOString().split("T")[0];

  const [existing] = await sql`
        SELECT current_streak, longest_streak, last_review_date, total_review_days, streak_milestones
        FROM app.user_streaks WHERE user_id = ${userId}::uuid
    `;

  if (!existing) {
    await sql`
            INSERT INTO app.user_streaks (user_id, current_streak, longest_streak, last_review_date, total_review_days, streak_milestones)
            VALUES (${userId}::uuid, 1, 1, ${today}::date, 1, '[]'::jsonb)
        `;
    return NextResponse.json({ current_streak: 1, newMilestone: null });
  }

  if (existing.last_review_date === today) {
    return NextResponse.json({
      current_streak: existing.current_streak,
      newMilestone: null,
    });
  }

  const lastDate = new Date(existing.last_review_date);
  const todayDate = new Date(today);
  const diffDays = Math.floor(
    (todayDate.getTime() - lastDate.getTime()) / 86400000,
  );

  let newStreak: number;
  if (diffDays === 1) {
    newStreak = existing.current_streak + 1;
  } else {
    newStreak = 1;
  }

  const longestStreak = Math.max(newStreak, existing.longest_streak);
  const totalDays = existing.total_review_days + 1;

  const existingMilestones = existing.streak_milestones || [];
  const reachedDays = existingMilestones.map((m: any) => m.days);
  let newMilestone: number | null = null;
  for (const m of MILESTONES) {
    if (newStreak >= m && !reachedDays.includes(m)) {
      newMilestone = m;
      existingMilestones.push({
        days: m,
        reached_at: new Date().toISOString(),
      });
    }
  }

  await sql`
        UPDATE app.user_streaks
        SET current_streak = ${newStreak},
            longest_streak = ${longestStreak},
            last_review_date = ${today}::date,
            total_review_days = ${totalDays},
            streak_milestones = ${JSON.stringify(existingMilestones)}::jsonb,
            updated_at = now()
        WHERE user_id = ${userId}::uuid
    `;

  return NextResponse.json({ current_streak: newStreak, newMilestone });
});
