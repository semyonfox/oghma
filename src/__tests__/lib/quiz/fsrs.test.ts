import { describe, it, expect } from 'vitest';
import {
    createNewCard,
    reviewCard,
    getNextIntervals,
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
