import type { QuestionType, QuizOption } from "./types";

const COMBINING_MARKS_REGEX = /\p{M}/gu;
const INCIDENTAL_PUNCTUATION_OR_SYMBOL_REGEX = /[^\p{L}\p{N}\s+#]/gu;
const WHITESPACE_REGEX = /\s+/g;
const ALTERNATIVE_DELIMITER_REGEX = /\s*(?:\||;)\s*/u;

/**
 * Normalize free-text quiz answers before comparing them.
 *
 * Fill-in answers are short recall prompts, so grading should not depend on
 * casing, accent marks, punctuation, or incidental whitespace.
 */
function normalizeFillAnswer(answer: string): string {
  return answer
    .normalize("NFKD")
    .replace(COMBINING_MARKS_REGEX, "")
    .toLocaleLowerCase("en")
    .replace(INCIDENTAL_PUNCTUATION_OR_SYMBOL_REGEX, " ")
    .replace(WHITESPACE_REGEX, " ")
    .trim();
}

function acceptedFillAnswers(correctAnswer: string | string[]): string[] {
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

export interface GradableQuestion {
  question_type: QuestionType;
  options: QuizOption[] | null;
  correct_answer: string;
}

/**
 * Choice questions without usable options fall back to typed answers, so the
 * client renders an input for them and grades them the same way.
 */
export function answersByTyping(question: GradableQuestion): boolean {
  return question.question_type === "fill_in" || !question.options?.length;
}

/**
 * Shared by the question card and the answer route so the feedback a student
 * sees always matches the rating that gets scheduled. Choice answers are graded
 * by the chosen option's flag rather than by comparing against correct_answer,
 * which older generated questions did not always keep in sync with the options.
 */
export function gradeAnswer(
  question: GradableQuestion,
  userAnswer: string,
): boolean {
  if (answersByTyping(question)) {
    return isFillAnswerCorrect(userAnswer, question.correct_answer);
  }

  const chosen = question.options?.find(
    (option) => option.text.trim() === userAnswer.trim(),
  );
  return chosen?.is_correct ?? false;
}
