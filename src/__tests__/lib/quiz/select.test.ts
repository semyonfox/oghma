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

    it('sorts due cards earliest-due first (most overdue first)', () => {
        const now = Date.now();
        const dueCards = [
            { id: 'c1', due: new Date(now - 1000).toISOString() },       // 1s overdue
            { id: 'c3', due: new Date(now - 100000).toISOString() },     // 100s overdue — most urgent
            { id: 'c2', due: new Date(now - 50000).toISOString() },      // 50s overdue
        ];
        const result = selectCards(dueCards, [], 3);
        expect(result.due[0].id).toBe('c3');
        expect(result.due[1].id).toBe('c2');
        expect(result.due[2].id).toBe('c1');
    });

    it('fills remaining slots with due cards when new/retention pools are empty', () => {
        const dueCards = Array.from({ length: 10 }, (_, i) => ({
            id: `d-${i}`,
            due: new Date(Date.now() - 1000).toISOString(),
        }));
        const result = selectCards(dueCards, [], 8);
        expect(result.due.length).toBe(8);
        expect(result.newChunks.length).toBe(0);
        expect(result.retention.length).toBe(0);
    });

    it('handles only mastered cards when due and new are absent', () => {
        const mastered = Array.from({ length: 15 }, (_, i) => ({
            id: `m-${i}`,
            due: new Date(Date.now() + 86400000).toISOString(),
        }));
        const result = selectCards([], [], 5, mastered);
        const total = result.due.length + result.newChunks.length + result.retention.length;
        expect(total).toBeLessThanOrEqual(5);
        expect(result.retention.length).toBeGreaterThan(0);
    });

    it('total never exceeds maxQuestions even with overflow', () => {
        // 14+4+2 = 20, then overflow trimming should keep total <= 10
        const due = Array.from({ length: 14 }, (_, i) => ({ id: `d-${i}`, due: new Date().toISOString() }));
        const chunks = Array.from({ length: 4 }, (_, i) => `ch-${i}`);
        const mastered = Array.from({ length: 2 }, (_, i) => ({ id: `m-${i}`, due: new Date().toISOString() }));
        const result = selectCards(due, chunks, 10, mastered);
        const total = result.due.length + result.newChunks.length + result.retention.length;
        expect(total).toBeLessThanOrEqual(10);
    });

    it('handles fewer available cards than maxQuestions gracefully', () => {
        const dueCards = [{ id: 'd1', due: new Date().toISOString() }];
        const result = selectCards(dueCards, [], 20);
        expect(result.due.length).toBe(1);
        const total = result.due.length + result.newChunks.length + result.retention.length;
        expect(total).toBeLessThanOrEqual(1);
    });
});
