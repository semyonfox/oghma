import { examPlan } from "@/lib/quiz/exam-plan";
import { describe, it, expect } from 'vitest';
import { Rating, State } from 'ts-fsrs';
import {
    createNewCard,
    reviewCard,
    ratingForAnswer,
    cardFromDB,
    cardToDB,
    type FSRSCard,
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
    it('schedules a first "good" review into the 10 minute learning step', () => {
        const { card } = reviewCard(createNewCard(T0), Rating.Good, T0);
        expect(card.state).toBe(State.Learning);
        expect(card.reps).toBe(1);
        expect(card.learning_steps).toBe(1);
        expect(card.due.getTime() - T0.getTime()).toBe(10 * 60_000);
    });

    it('graduates a learning card on the next "good" after a DB round trip', () => {
        // regression: learning_steps was not persisted, so every reload
        // restarted step 0 and a "good" card stayed in learning forever
        let row = reviewViaDB(cardToDB(createNewCard(T0)), Rating.Good, T0);
        row = reviewViaDB(row, Rating.Good, new Date(T0.getTime() + DAY));
        expect(row.state).toBe('review');
        expect(row.scheduled_days).toBeGreaterThanOrEqual(1);
    });

    it('records a lapse and moves a review card into relearning on "again"', () => {
        const graduated = reviewCard(createNewCard(T0), Rating.Easy, T0).card;
        expect(graduated.state).toBe(State.Review);

        const lapsed = reviewCard(graduated, Rating.Again, graduated.due).card;
        expect(lapsed.state).toBe(State.Relearning);
        expect(lapsed.lapses).toBe(1);
    });

    it('keeps very long intervals bounded near the 100 year maximum', () => {
        const veteran: FSRSCard = {
            ...createNewCard(T0),
            state: State.Review,
            stability: 30_000,
            difficulty: 3,
            scheduled_days: 36_500,
            reps: 30,
            last_review: T0,
            due: new Date(T0.getTime() + 36_500 * DAY),
        };
        const { card } = reviewCard(veteran, Rating.Easy, veteran.due);
        // ts-fsrs caps "good" at maximum_interval and keeps "easy" strictly
        // above it, so the reference result is a couple of days past the cap
        expect(card.scheduled_days).toBeLessThanOrEqual(36_500 + 2);
        expect(Number.isNaN(card.due.getTime())).toBe(false);
        expect(Number.isFinite(card.stability)).toBe(true);
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
    it('adds only long-interval cards below target retention at the exam', () => {
        const card = { ...createNewCard(T0), state: State.Review, last_review: T0,
            stability: 1, due: new Date(T0.getTime() + 30 * DAY) };
        const safe = { ...card, stability: 1000 };
        const result = examPlan([{ id: 'low', card }, { id: 'safe', card: safe }], 5, options);
        expect(result.total).toBe(1);
        expect(result.days.flatMap((day) => day.cardIds)).toEqual(['low']);
        expect(result.days[0].extra).toBe(1);
    });
    it('reports excess work and zero remaining days without hiding cards', () => {
        const cards = Array.from({ length: 21 }, (_, i) => ({ id: String(i), card: createNewCard(T0) }));
        expect(examPlan(cards, 1, options)).toMatchObject({ total: 21, impossible: true });
        expect(examPlan(cards, 0, options)).toMatchObject({ total: 21, unallocated: 21, impossible: true });
    });
    it('buckets normal due dates in the student time zone across DST', () => {
        const now = new Date('2026-10-31T23:30:00Z');
        const card = { ...createNewCard(now), due: new Date('2026-11-01T01:30:00Z') };
        const result = examPlan([{ id: 'a', card }], 3, { now, examAt: new Date('2026-11-03T12:00:00Z'), timeZone: 'America/New_York' });
        expect(result.days[0]).toMatchObject({ date: '2026-10-31', normal: 1 });
    });
});
