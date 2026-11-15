import type { Card } from "ts-fsrs";
import { dateKeyInTimeZone } from "./time-zone";

const DAY = 86_400_000;
export const EXAM_DAILY_CAPACITY = 20;

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

// one next review per card, without changing stored FSRS state
export function examPlan(
  cards: readonly ExamPlanCard[],
  daysLeft: number,
  {
    now,
    examAt,
    timeZone,
    createdAt,
    shared = new Map<string, string>(),
    completedToday = 0,
  }: {
    now: Date;
    examAt: Date;
    timeZone: string;
    createdAt?: Date;
    shared?: Map<string, string>;
    completedToday?: number;
  },
) {
  if (!Number.isInteger(daysLeft) || daysLeft < 0 || daysLeft > 3660)
    throw new RangeError("daysLeft must be between 0 and 3660");
  const today = dateKeyInTimeZone(now, timeZone);
  const start = Date.parse(`${today}T00:00:00Z`);
  const days: ExamPlanDay[] = Array.from({ length: daysLeft }, (_, i) => ({
    date: new Date(start + i * DAY).toISOString().slice(0, 10),
    cardIds: [],
    normal: 0,
    extra: 0,
  }));
  const unique = [...new Map(cards.map((card) => [card.id, card])).values()];
  // a review since exam creation already fulfils the extra review
  const extras: ExamPlanCard[] = [];
  const examDate = dateKeyInTimeZone(examAt, timeZone);
  for (const entry of unique) {
    if (entry.card.due <= examAt) {
      const dueDate = dateKeyInTimeZone(entry.card.due, timeZone);
      const planned = shared.get(entry.id);
      const day = days.find((day) => day.date >= (planned ?? dueDate));
      if (day) {
        day.cardIds.push(entry.id);
        day.normal++;
      }
    } else if (
      !createdAt || !entry.card.last_review || entry.card.last_review < createdAt
    ) {
      extras.push(entry);
    }
  }
  // share both assignments and the cap across overlapping exams
  const extraLoads = new Map<string, number>();
  for (const date of shared.values()) {
    extraLoads.set(date, (extraLoads.get(date) ?? 0) + 1);
  }
  let unallocated = days.length === 0 ? unique.length : 0;
  extras.sort((a, b) =>
    (b.weight ?? 1) - (a.weight ?? 1) || a.id.localeCompare(b.id),
  );
  for (const entry of extras) {
    const existing = shared.get(entry.id);
    const day = existing
      ? days.find((day) => day.date === existing)
      : days.filter((day) =>
          day.date < examDate &&
          (extraLoads.get(day.date) ?? 0) +
            (day.date === today ? completedToday : 0) < EXAM_DAILY_CAPACITY,
        )
        .reduce<ExamPlanDay | undefined>((best, next) => {
          const load = (day: ExamPlanDay) => day.normal + (extraLoads.get(day.date) ?? 0);
          return !best || load(next) < load(best) ? next : best;
        }, undefined);
    if (day) {
      day.cardIds.push(entry.id);
      day.extra++;
      if (!existing) {
        shared.set(entry.id, day.date);
        extraLoads.set(day.date, (extraLoads.get(day.date) ?? 0) + 1);
      }
    } else if (days.length > 0) unallocated++;
  }
  return {
    days,
    unallocated,
    impossible: unallocated > 0,
    total: days.reduce((sum, day) => sum + day.cardIds.length, 0) + unallocated,
  };
}
