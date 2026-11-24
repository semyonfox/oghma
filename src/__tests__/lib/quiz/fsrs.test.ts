import { examPlan } from "@/lib/quiz/exam-plan";
import { describe, it, expect } from 'vitest';
import { Rating, State } from 'ts-fsrs';
import {
    createNewCard,
    reviewCard,
    ratingForAnswer,
    cardFromDB,
    cardToDB,
    type FSRSCardRow,
    type FSRSRating,
} from '@/lib/quiz/fsrs';

const T0 = new Date('2026-01-01T10:00:00.000Z');
const DAY = 86_400_000;

// review through the DB representation, the way the answer route does
function reviewViaDB(row: FSRSCardRow, rating: FSRSRating, now: Date): FSRSCardRow {
    return cardToDB(reviewCard(cardFromDB(row), rating, now).card);
}

describe('FSRS scheduling', () => {
    it('graduates a learning card on the next "good" after a DB round trip', () => {
        // regression: learning_steps was not persisted, so every reload
        // restarted step 0 and a "good" card stayed in learning forever
        let row = reviewViaDB(cardToDB(createNewCard(T0)), Rating.Good, T0);
        row = reviewViaDB(row, Rating.Good, new Date(T0.getTime() + DAY));
        expect(row.state).toBe('review');
        expect(row.scheduled_days).toBeGreaterThanOrEqual(1);
    });
});

describe('ratingForAnswer', () => {
    it.each([
        [false, 3000, Rating.Again],
        [true, null, Rating.Good],
        [true, 0, Rating.Good],
        [true, 4999, Rating.Easy],
        [true, 12_000, Rating.Good],
        [true, 20_001, Rating.Hard],
    ] as const)('correct=%s in %sms rates %s', (correct, ms, rating) => {
        expect(ratingForAnswer(correct, ms)).toBe(rating);
    });
});

describe('cardFromDB / cardToDB', () => {
    const dbRow: FSRSCardRow = {
        state: 'new',
        stability: 0,
        difficulty: 0,
        scheduled_days: 1,
        learning_steps: 0,
        reps: 0,
        lapses: 0,
        due: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        last_review: null,
    };

    it.each([
        ['new', State.New],
        ['learning', State.Learning],
        ['review', State.Review],
        ['relearning', State.Relearning],
        ['unknown_state', State.New],
    ])('maps state "%s"', (state, expected) => {
        expect(cardFromDB({ ...dbRow, state }).state).toBe(expected);
    });

    it('accepts the Date objects postgres returns for timestamptz columns', () => {
        const due = new Date('2026-02-01T00:00:00.000Z');
        const card = cardFromDB({ ...dbRow, due, last_review: due });
        expect(card.due.toISOString()).toBe(due.toISOString());
        expect(card.last_review?.toISOString()).toBe(due.toISOString());
    });

    it('maps null last_review to undefined and back to null', () => {
        const card = cardFromDB(dbRow);
        expect(card.last_review).toBeUndefined();
        expect(cardToDB(card).last_review).toBeNull();
    });

    it('roundtrips every scheduler field, including learning_steps', () => {
        const row: FSRSCardRow = {
            state: 'relearning',
            stability: 4.5,
            difficulty: 6.2,
            scheduled_days: 0,
            learning_steps: 1,
            reps: 7,
            lapses: 2,
            due: '2026-03-01T12:00:00.000Z',
            last_review: '2026-02-28T12:00:00.000Z',
        };
        expect(cardToDB(cardFromDB(row))).toEqual(row);
    });
});


describe('exam workload estimates', () => {
    const options = { now: T0, examAt: new Date(T0.getTime() + 4 * DAY), timeZone: 'UTC' };
    it('keeps due work on its normal day and never mutates cards', () => {
        const card = { ...createNewCard(T0), due: new Date(T0.getTime() + DAY) };
        const before = structuredClone(card);
        const result = examPlan([{ id: 'a', card }, { id: 'a', card }], 5, options);
        expect(result.days[1]).toMatchObject({ normal: 1, extra: 0, cardIds: ['a'] });
        expect(result.total).toBe(1);
        expect(card).toEqual(before);
    });
    it('pulls all future cards forward, including high-retention cards', () => {
        const card = { ...createNewCard(T0), state: State.Review, last_review: T0,
            stability: 1, due: new Date(T0.getTime() + 30 * DAY) };
        const safe = { ...card, stability: 1000 };
        const result = examPlan([{ id: 'low', card }, { id: 'safe', card: safe }], 5, options);
        expect(result.total).toBe(2);
        expect(result.days.flatMap((day) => day.cardIds)).toEqual(['low', 'safe']);
        expect(result.days[0].extra).toBe(1);
    });
    it('reports excess work and zero remaining days without hiding cards', () => {
        const cards = Array.from({ length: 21 }, (_, i) => ({ id: String(i), card: createNewCard(T0) }));
        expect(examPlan(cards, 1, options)).toMatchObject({ total: 21, impossible: false });
        expect(examPlan(cards, 0, options)).toMatchObject({ total: 21, unallocated: 21, impossible: true });
    });
    it('buckets normal due dates in the student time zone across DST', () => {
        const now = new Date('2026-10-31T23:30:00Z');
        const card = { ...createNewCard(now), due: new Date('2026-11-01T01:30:00Z') };
        const result = examPlan([{ id: 'a', card }], 3, { now, examAt: new Date('2026-11-03T12:00:00Z'), timeZone: 'America/New_York' });
        expect(result.days[0]).toMatchObject({ date: '2026-10-31', normal: 1 });
    });
});


describe('exam review limits', () => {
    const options = { now: T0, examAt: new Date(T0.getTime() + 2 * DAY), timeZone: 'UTC', createdAt: T0 };
    const future = (id: string) => ({ id, card: { ...createNewCard(T0), state: State.Review, due: new Date(T0.getTime() + 30 * DAY) } });
    it('shares the cap and assignments across exams, with excess work visible', () => {
        const shared = new Map<string, string>();
        const cards = Array.from({ length: 45 }, (_, i) => future(String(i)));
        const first = examPlan(cards, 3, { ...options, shared });
        const second = examPlan(cards, 4, { ...options, examAt: new Date(T0.getTime() + 3 * DAY), shared });
        expect(first).toMatchObject({ total: 45, unallocated: 5, impossible: true });
        expect(first.days.map((day) => day.extra)).toEqual([20, 20, 0]);
        expect(second.days.map((day) => day.extra)).toEqual([20, 20, 5, 0]);
        expect(new Set(second.days.flatMap((day) => day.cardIds)).size).toBe(45);
        for (const day of first.days) for (const id of day.cardIds) expect(shared.get(id)).toBe(day.date);
    });
    it('does not refill today beyond the cap after reviews or pull a completed card again', () => {
        const cards = Array.from({ length: 30 }, (_, i) => future(String(i)));
        cards[0].card.last_review = T0;
        const result = examPlan(cards, 3, { ...options, completedToday: 19 });
        expect(result.days[0].extra).toBe(1);
        expect(result.days.flatMap((day) => day.cardIds)).not.toContain('0');
        expect(result.unallocated).toBe(8);
    });
    it('recomputes on date, scope and card changes without changing FSRS due dates', () => {
        const cards = [future('a'), future('b')];
        expect(examPlan(cards, 1, { ...options, examAt: T0 }).unallocated).toBe(2);
        expect(examPlan(cards, 3, options).unallocated).toBe(0);
        expect(examPlan(cards.slice(1), 3, options).total).toBe(1);
        cards[1].card.due = new Date(T0.getTime() + DAY);
        expect(examPlan(cards, 3, options).days[1]).toMatchObject({ normal: 1, cardIds: ['b'] });
        expect(cards[0].card.due.getTime()).toBe(T0.getTime() + 30 * DAY);
    });
});
