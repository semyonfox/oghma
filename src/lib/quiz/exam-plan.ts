import { fsrs, type Card } from "ts-fsrs";
import { dateKeyInTimeZone } from "./time-zone";

const scheduler = fsrs();
const DAY = 86_400_000;
export const EXAM_DAILY_CAPACITY = 20;
export const EXAM_TARGET_RETENTION = 0.9;

export interface ExamPlanCard {
  id: string;
  card: Card;
  weight?: number;
}
export interface ExamPlanDay {
  date: string;
  cardIds: string[];
  normal: number;
  extra: number;
}

// estimates one next review per card, never mutates scheduler state
export function examPlan(
  cards: readonly ExamPlanCard[],
  daysLeft: number,
  {
    now,
    examAt,
    timeZone,
    targetRetention = EXAM_TARGET_RETENTION,
  }: {
    now: Date;
    examAt: Date;
    timeZone: string;
    targetRetention?: number;
  },
) {
  if (!Number.isInteger(daysLeft) || daysLeft < 0 || daysLeft > 3660)
    throw new RangeError("daysLeft must be between 0 and 3660");
  if (!(targetRetention > 0 && targetRetention < 1))
    throw new RangeError("targetRetention must be between 0 and 1");
  const today = dateKeyInTimeZone(now, timeZone);
  const start = Date.parse(`${today}T00:00:00Z`);
  const days: ExamPlanDay[] = Array.from({ length: daysLeft }, (_, i) => ({
    date: new Date(start + i * DAY).toISOString().slice(0, 10),
    cardIds: [],
    normal: 0,
    extra: 0,
  }));
  const unique = [...new Map(cards.map((card) => [card.id, card])).values()];
  const extras: ExamPlanCard[] = [];
  for (const entry of unique) {
    if (entry.card.due <= examAt) {
      const dueDate = dateKeyInTimeZone(entry.card.due, timeZone);
      const day = days.find((day) => day.date >= dueDate) ?? days.at(-1);
      if (day) {
        day.cardIds.push(entry.id);
        day.normal++;
      }
    } else if (
      scheduler.retrievability(entry.card, examAt) < targetRetention
    ) {
      extras.push(entry);
    }
  }
  // higher mark-share topics get first choice of the least busy days
  extras.sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
  for (const entry of extras) {
    const day = days.reduce<ExamPlanDay | undefined>(
      (best, next) =>
        !best || next.cardIds.length < best.cardIds.length ? next : best,
      undefined,
    );
    if (day) {
      day.cardIds.push(entry.id);
      day.extra++;
    }
  }
  const unallocated = days.length === 0 ? unique.length : 0;
  return {
    days,
    unallocated,
    impossible:
      unallocated > 0 ||
      days.some((day) => day.cardIds.length > EXAM_DAILY_CAPACITY),
    total: days.reduce((sum, day) => sum + day.cardIds.length, 0) + unallocated,
  };
}
