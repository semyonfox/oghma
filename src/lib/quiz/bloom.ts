import type { BloomLevel, QuestionType } from './types';
import { BLOOM_QUESTION_TYPES } from './types';

interface ReviewRecord {
    bloom_level: number;
    was_correct: boolean;
}

// determine current bloom level from review history for a specific chunk
export function getCurrentBloomLevel(reviews: ReviewRecord[]): BloomLevel {
    if (reviews.length === 0) return 1;

    // find highest bloom level where the user has demonstrated mastery
    for (let level = 4; level >= 1; level--) {
        const atLevel = reviews.filter(r => r.bloom_level === level);
        if (atLevel.length >= 3) {
            const accuracy = atLevel.filter(r => r.was_correct).length / atLevel.length;
            if (accuracy >= 0.8) return Math.min(level + 1, 4) as BloomLevel;
        }
    }

    // find highest level attempted
    const maxAttempted = Math.max(...reviews.map(r => r.bloom_level));
    return Math.min(Math.max(maxAttempted, 1), 4) as BloomLevel;
}

// should we advance to the next bloom level?
export function shouldAdvanceBloom(
    currentLevel: BloomLevel,
    reviews: ReviewRecord[],
): boolean {
    if (currentLevel >= 4) return false;

    const atLevel = reviews.filter(r => r.bloom_level === currentLevel);
    if (atLevel.length < 3) return false;

    const accuracy = atLevel.filter(r => r.was_correct).length / atLevel.length;
    if (accuracy < 0.8) return false;

    // check last 3 are consecutive correct
    const last3 = atLevel.slice(-3);
    return last3.every(r => r.was_correct);
}

// pick a random question type appropriate for the bloom level
export function pickQuestionType(bloomLevel: BloomLevel): QuestionType {
    const types = BLOOM_QUESTION_TYPES[bloomLevel];
    return types[Math.floor(Math.random() * types.length)];
}
