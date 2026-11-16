import type { BloomLevel, QuestionType } from "./types";
import { BLOOM_QUESTION_TYPES } from "./types";

interface ReviewRecord {
  bloom_level: number;
  was_correct: boolean;
}

// plain recall made for trivia, so a chunk's first question already asks why or how
export const START_BLOOM_LEVEL: BloomLevel = 2;

/**
 * The level of the next question to generate for a chunk, or null when it
 * should get none yet. A chunk starts at START_BLOOM_LEVEL and steps up once
 * its hardest question so far was answered correctly twice in a row.
 */
export function nextBloomLevel(
  existingLevels: readonly number[],
  reviews: readonly ReviewRecord[],
): BloomLevel | null {
  if (existingLevels.length === 0) return START_BLOOM_LEVEL;
  const top = Math.max(...existingLevels);
  if (top >= 4) return null;
  const lastTwo = reviews.filter((review) => review.bloom_level === top).slice(-2);
  return lastTwo.length === 2 && lastTwo.every((review) => review.was_correct)
    ? ((top + 1) as BloomLevel)
    : null;
}

// pick a random question type appropriate for the bloom level
export function pickQuestionType(bloomLevel: BloomLevel): QuestionType {
  const types = BLOOM_QUESTION_TYPES[bloomLevel];
  return types[Math.floor(Math.random() * types.length)];
}
