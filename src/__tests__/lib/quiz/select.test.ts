import { describe, it, expect } from 'vitest';
import { selectCards } from '@/lib/quiz/select';

describe('card selection', () => {
    it('returns empty when no cards available', () => {
        const result = selectCards([], [], 20);
        expect(result).toEqual({ due: [], newChunks: [], retention: [] });
    });

    it('respects max session size', () => {
        const dueCards = Array.from({ length: 30 }, (_, i) => ({
            id: `card-${i}`,
            due: new Date(Date.now() - 1000).toISOString(),
        }));
        const result = selectCards(dueCards, [], 20);
        const total = result.due.length + result.newChunks.length + result.retention.length;
        expect(total).toBeLessThanOrEqual(20);
    });

    it('allocates roughly 70/20/10 split when all categories have cards', () => {
        const dueCards = Array.from({ length: 50 }, (_, i) => ({
            id: `due-${i}`,
            due: new Date(Date.now() - 1000).toISOString(),
        }));
        const newChunks = Array.from({ length: 50 }, (_, i) => `chunk-${i}`);
        const masteredCards = Array.from({ length: 50 }, (_, i) => ({
            id: `mastered-${i}`,
            due: new Date(Date.now() + 86400000 * 30).toISOString(),
        }));
        const result = selectCards(dueCards, newChunks, 20, masteredCards);
        expect(result.due.length).toBeGreaterThanOrEqual(10);
        expect(result.newChunks.length).toBeGreaterThanOrEqual(2);
    });
});
