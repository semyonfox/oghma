import { describe, it, expect } from 'vitest';
import {
    getCurrentBloomLevel,
    shouldAdvanceBloom,
    pickQuestionType,
} from '@/lib/quiz/bloom';
import type { BloomLevel } from '@/lib/quiz/types';

describe('bloom level tracking', () => {
    it('returns level 1 when no reviews exist', () => {
        const level = getCurrentBloomLevel([]);
        expect(level).toBe(1);
    });

    it('stays at current level with mixed results', () => {
        const reviews = [
            { bloom_level: 1, was_correct: true },
            { bloom_level: 1, was_correct: false },
            { bloom_level: 1, was_correct: true },
        ];
        expect(shouldAdvanceBloom(1, reviews)).toBe(false);
    });

    it('advances when 3+ consecutive correct at >80% accuracy', () => {
        const reviews = [
            { bloom_level: 1, was_correct: true },
            { bloom_level: 1, was_correct: true },
            { bloom_level: 1, was_correct: true },
            { bloom_level: 1, was_correct: true },
        ];
        expect(shouldAdvanceBloom(1, reviews)).toBe(true);
    });

    it('does not advance past level 4', () => {
        const reviews = Array.from({ length: 5 }, () => ({
            bloom_level: 4,
            was_correct: true,
        }));
        expect(shouldAdvanceBloom(4 as BloomLevel, reviews)).toBe(false);
    });

    it('picks a valid question type for each bloom level', () => {
        expect(['mcq', 'true_false']).toContain(pickQuestionType(1));
        expect(['mcq', 'true_false', 'fill_in']).toContain(pickQuestionType(2));
        expect(['mcq', 'fill_in']).toContain(pickQuestionType(3));
        expect(['mcq', 'fill_in']).toContain(pickQuestionType(4));
    });
});
