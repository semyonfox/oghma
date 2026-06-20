const COMBINING_MARKS_REGEX = /\p{M}/gu;
const PUNCTUATION_OR_SYMBOL_REGEX = /[\p{P}\p{S}]/gu;
const WHITESPACE_REGEX = /\s+/g;

/**
 * Normalize free-text quiz answers before comparing them.
 *
 * Fill-in answers are short recall prompts, so grading should not depend on
 * casing, accent marks, punctuation, or incidental whitespace.
 */
export function normalizeFillAnswer(answer: string): string {
  return answer
    .normalize("NFKD")
    .replace(COMBINING_MARKS_REGEX, "")
    .toLocaleLowerCase("en")
    .replace(PUNCTUATION_OR_SYMBOL_REGEX, " ")
    .replace(WHITESPACE_REGEX, " ")
    .trim();
}

export function isFillAnswerCorrect(userAnswer: string, correctAnswer: string): boolean {
  const normalizedUserAnswer = normalizeFillAnswer(userAnswer);
  return (
    normalizedUserAnswer.length > 0 &&
    normalizedUserAnswer === normalizeFillAnswer(correctAnswer)
  );
}
