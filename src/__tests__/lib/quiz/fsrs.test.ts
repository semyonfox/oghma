import { describe, it, expect } from 'vitest';
import {
    createNewCard,
    reviewCard,
    getNextIntervals,
    cardFromDB,
    cardToDB,
} from '@/lib/quiz/fsrs';

describe('FSRS wrapper', () => {
    it('creates a new card with default state', () => {
        const card = createNewCard();
        expect(card.state).toBe(0); // New
        expect(card.reps).toBe(0);
        expect(card.lapses).toBe(0);
    });

    it('advances card state on "good" rating', () => {
        const card = createNewCard();
        const { card: updated } = reviewCard(card, 3); // good
        expect(updated.reps).toBe(1);
        expect(updated.stability).toBeGreaterThan(0);
    });

    it('resets card on "again" rating after reviews', () => {
        let card = createNewCard();
        ({ card } = reviewCard(card, 3));
        ({ card } = reviewCard(card, 3));
        const { card: lapsed } = reviewCard(card, 1); // again
        expect(lapsed.lapses).toBeGreaterThan(0);
    });

    it('getNextIntervals returns 4 interval predictions', () => {
        const card = createNewCard();
        const intervals = getNextIntervals(card);
        expect(Object.keys(intervals)).toHaveLength(4);
        expect(intervals[1]).toBeDefined(); // again
        expect(intervals[2]).toBeDefined(); // hard
        expect(intervals[3]).toBeDefined(); // good
        expect(intervals[4]).toBeDefined(); // easy
        // easy should be >= good
        expect(intervals[4]).toBeGreaterThanOrEqual(intervals[3]);
    });
});

describe('cardFromDB / cardToDB', () => {
    const dbRow = {
        state: 'new',
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 1,
        reps: 0,
        lapses: 0,
        due: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        last_review: null,
    };

    it('maps state string "new" to numeric 0', () => {
        const card = cardFromDB(dbRow);
        expect(card.state).toBe(0);
    });

    it('maps state string "learning" to numeric 1', () => {
        const card = cardFromDB({ ...dbRow, state: 'learning' });
        expect(card.state).toBe(1);
    });

    it('maps state string "review" to numeric 2', () => {
        const card = cardFromDB({ ...dbRow, state: 'review' });
        expect(card.state).toBe(2);
    });

    it('maps state string "relearning" to numeric 3', () => {
        const card = cardFromDB({ ...dbRow, state: 'relearning' });
        expect(card.state).toBe(3);
    });

    it('defaults unknown state to 0 (new)', () => {
        const card = cardFromDB({ ...dbRow, state: 'unknown_state' });
        expect(card.state).toBe(0);
    });

    it('preserves numeric fields through cardFromDB', () => {
        const row = { ...dbRow, stability: 4.5, difficulty: 6.2, reps: 3, lapses: 1 };
        const card = cardFromDB(row);
        expect(card.stability).toBe(4.5);
        expect(card.difficulty).toBe(6.2);
        expect(card.reps).toBe(3);
        expect(card.lapses).toBe(1);
    });

    it('parses due date string into a Date object', () => {
        const card = cardFromDB(dbRow);
        expect(card.due).toBeInstanceOf(Date);
        expect(card.due.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });

    it('maps null last_review to undefined', () => {
        const card = cardFromDB({ ...dbRow, last_review: null });
        expect(card.last_review).toBeUndefined();
    });

    it('parses non-null last_review into a Date', () => {
        const ts = '2025-12-01T10:00:00.000Z';
        const card = cardFromDB({ ...dbRow, last_review: ts });
        expect(card.last_review).toBeInstanceOf(Date);
        expect(card.last_review!.toISOString()).toBe(ts);
    });

    it('roundtrips through cardToDB without data loss', () => {
        const original = cardFromDB(dbRow);
        const serialized = cardToDB(original);
        const restored = cardFromDB(serialized);
        expect(restored.state).toBe(original.state);
        expect(restored.stability).toBe(original.stability);
        expect(restored.reps).toBe(original.reps);
        expect(restored.lapses).toBe(original.lapses);
        expect(restored.due.getTime()).toBeCloseTo(original.due.getTime(), -1);
    });

    it('cardToDB maps state 2 back to "review"', () => {
        const card = cardFromDB({ ...dbRow, state: 'review' });
        const out = cardToDB(card);
        expect(out.state).toBe('review');
    });

    it('cardToDB produces ISO strings for date fields', () => {
        const card = cardFromDB(dbRow);
        const out = cardToDB(card);
        expect(out.due).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(out.last_review).toBeNull();
    });

    it('full review cycle preserves state progression through DB layer', () => {
        const fresh = createNewCard();
        const { card: reviewed } = reviewCard(fresh, 3); // good rating
        const dbOut = cardToDB(reviewed);
        expect(dbOut.reps).toBe(1);
        expect(dbOut.state).not.toBe('new');
        const restored = cardFromDB(dbOut);
        expect(restored.reps).toBe(1);
    });
});
