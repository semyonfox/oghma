const COMBINING_MARKS_REGEX = /\p{M}/gu;
const PUNCTUATION_OR_SYMBOL_REGEX = /[\p{P}\p{S}]/gu;
const WHITESPACE_REGEX = /\s+/g;
const ALTERNATIVE_DELIMITER_REGEX = /\s*(?:\||;)\s*/u;

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

export function acceptedFillAnswers(correctAnswer: string | string[]): string[] {
  const candidates = Array.isArray(correctAnswer)
    ? correctAnswer
    : correctAnswer.split(ALTERNATIVE_DELIMITER_REGEX);

  const normalized = candidates
    .map((candidate) => normalizeFillAnswer(candidate))
    .filter((candidate) => candidate.length > 0);

  return Array.from(new Set(normalized));
}

export function isFillAnswerCorrect(
  userAnswer: string,
  correctAnswer: string | string[],
): boolean {
  const normalizedUserAnswer = normalizeFillAnswer(userAnswer);
  return (
    normalizedUserAnswer.length > 0 &&
    acceptedFillAnswers(correctAnswer).includes(normalizedUserAnswer)
  );
}
