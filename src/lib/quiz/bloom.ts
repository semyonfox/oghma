import type { BloomLevel, QuestionType } from "./types";
import { BLOOM_QUESTION_TYPES } from "./types";

interface ReviewRecord {
  bloom_level: number;
  was_correct: boolean;
}

// determine current bloom level from review history for a specific chunk
export function getCurrentBloomLevel(reviews: ReviewRecord[]): BloomLevel {
  if (reviews.length === 0) return 1;

  // zpd targeting: keep challenge around a productive difficulty band
  // prefer recent performance to avoid overreacting to old attempts
  const maxAttempted = Math.min(
    Math.max(...reviews.map((r) => r.bloom_level), 1),
    4,
  ) as BloomLevel;

  const recent = reviews.slice(-8);
  const recentAtLevel = recent.filter((r) => r.bloom_level === maxAttempted);
  const samples =
    recentAtLevel.length > 0
      ? recentAtLevel
      : reviews.filter((r) => r.bloom_level === maxAttempted);

  if (samples.length < 2) return maxAttempted;

  const accuracy = samples.filter((r) => r.was_correct).length / samples.length;

  // too easy -> increase challenge
  if (accuracy >= 0.85 && samples.length >= 3 && maxAttempted < 4) {
    return (maxAttempted + 1) as BloomLevel;
  }

  // too difficult -> step down to stay in zpd
  if (accuracy <= 0.5 && maxAttempted > 1) {
    return (maxAttempted - 1) as BloomLevel;
  }

  // just right -> stay here
  return maxAttempted;
}

// should we advance to the next bloom level?
export function shouldAdvanceBloom(
  currentLevel: BloomLevel,
  reviews: ReviewRecord[],
): boolean {
  if (currentLevel >= 4) return false;

  const atLevel = reviews.filter((r) => r.bloom_level === currentLevel);
  if (atLevel.length < 3) return false;

  const accuracy = atLevel.filter((r) => r.was_correct).length / atLevel.length;
  if (accuracy < 0.8) return false;

  // check last 3 are consecutive correct
  const last3 = atLevel.slice(-3);
  return last3.every((r) => r.was_correct);
}

// pick a random question type appropriate for the bloom level
export function pickQuestionType(bloomLevel: BloomLevel): QuestionType {
  const types = BLOOM_QUESTION_TYPES[bloomLevel];
  return types[Math.floor(Math.random() * types.length)];
}
