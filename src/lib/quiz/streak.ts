import sql from "@/database/pgsql";
import type { QuizStreakResult, UserStreak } from "@/lib/quiz/types";
import type postgres from "postgres";

const MILESTONES = [7, 14, 30, 60, 90, 180, 365] as const;
const DAY_MS = 86_400_000;

type StreakRow = Omit<Pick<
  UserStreak,
  | "current_streak"
  | "longest_streak"
  | "last_review_date"
  | "total_review_days"
  | "streak_milestones"
>, "last_review_date"> & {
  last_review_date: string | Date | null;
};

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeDateKey(value: string | Date): string {
  if (value instanceof Date) {
    return utcDateKey(value);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && utcDateKey(parsed) === value) {
      return value;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`Invalid quiz streak date: ${value}`);
  }
  return utcDateKey(parsed);
}

function daysBetween(from: string, to: string): number {
  return Math.floor(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      DAY_MS,
  );
}

/**
 * Advances a user's quiz streak at most once per UTC day. The transaction and
 * row lock make concurrent answer submissions and direct streak requests safe.
 */
export async function advanceQuizStreak(
  userId: string,
  date = new Date(),
): Promise<QuizStreakResult> {
  const today = utcDateKey(date);

  return sql.begin(async (tx: postgres.TransactionSql) => {
    const inserted = await tx<Array<{ current_streak: number }>>`
      INSERT INTO app.user_streaks (
        user_id, current_streak, longest_streak, last_review_date,
        total_review_days, streak_milestones
      )
      VALUES (${userId}::uuid, 1, 1, ${today}::date, 1, '[]'::jsonb)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING current_streak
    `;

    if (inserted.length > 0) {
      return { advanced: true, current_streak: 1, newMilestone: null };
    }

    const [existing] = await tx<StreakRow[]>`
      SELECT current_streak, longest_streak, last_review_date,
             total_review_days, streak_milestones
      FROM app.user_streaks
      WHERE user_id = ${userId}::uuid
      FOR UPDATE
    `;

    const lastReviewDate = existing.last_review_date
      ? normalizeDateKey(existing.last_review_date)
      : null;

    if (lastReviewDate === today) {
      return {
        advanced: false,
        current_streak: existing.current_streak,
        newMilestone: null,
      };
    }

    const newStreak =
      lastReviewDate &&
      daysBetween(lastReviewDate, today) === 1
        ? existing.current_streak + 1
        : 1;
    const reachedDays = new Set(
      existing.streak_milestones.map((milestone) => milestone.days),
    );
    const newlyReached = MILESTONES.filter(
      (milestone) => newStreak >= milestone && !reachedDays.has(milestone),
    );
    const reachedAt = date.toISOString();
    const milestones = [
      ...existing.streak_milestones,
      ...newlyReached.map((days) => ({ days, reached_at: reachedAt })),
    ];

    await tx`
      UPDATE app.user_streaks
      SET current_streak = ${newStreak},
          longest_streak = ${Math.max(newStreak, existing.longest_streak)},
          last_review_date = ${today}::date,
          total_review_days = ${existing.total_review_days + 1},
          streak_milestones = ${JSON.stringify(milestones)}::jsonb,
          updated_at = now()
      WHERE user_id = ${userId}::uuid
    `;

    return {
      advanced: true,
      current_streak: newStreak,
      newMilestone: newlyReached.at(-1) ?? null,
    };
  });
}
