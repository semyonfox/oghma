import type { QuizOption } from "./types";

// Marker page-rank artifacts are present in both stored questions and source chunks.
const MARKER_ARTIFACT_RE = /^\s*\{\d+\}-+\s*$/gm;

export function stripQuizArtifacts(text: string): string {
  return text.replace(MARKER_ARTIFACT_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

function parseBoolLike(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function parseOptionText(value: unknown): string | null {
  if (value == null) return null;

  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  return null;
}

function parseOptionsJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isTrueFalse(options: QuizOption[]): boolean {
  return (
    options.length === 2 &&
    options.some((o) => o.text === "True") &&
    options.some((o) => o.text === "False")
  );
}

function shuffleOptions(options: QuizOption[]): QuizOption[] {
  if (isTrueFalse(options)) return options;
  const arr = [...options];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function normalizeQuizOptions(value: unknown): QuizOption[] | null {
  if (value == null) return null;

  let source: unknown = value;
  if (typeof source === "string") {
    source = parseOptionsJson(source);
  }

  const wrappedOptions = asRecord(source);
  if (wrappedOptions && ("options" in wrappedOptions || "Options" in wrappedOptions)) {
    source = wrappedOptions.options ?? wrappedOptions.Options;
  }

  if (!Array.isArray(source)) return null;

  const options = source
    .map((option): QuizOption | null => {
      if (!option || typeof option !== "object") return null;

      const optionFields = asRecord(option);
      if (!optionFields) return null;

      const text = optionFields.text;
      const isCorrect = parseBoolLike(
        optionFields.is_correct ?? optionFields.correct ?? optionFields.isCorrect,
      );

      const parsedText = parseOptionText(text);

      if (parsedText === null || isCorrect === null) {
        return null;
      }

      return { text: stripQuizArtifacts(parsedText), is_correct: isCorrect };
    })
    .filter((option): option is QuizOption => option !== null);

  if (options.length === 0) return null;
  return shuffleOptions(options);
}

export function normalizeQuizQuestion<T extends { options?: unknown; question_text?: unknown; correct_answer?: unknown; explanation?: unknown }>(
  question: T | null,
): (Omit<T, "options"> & { options: QuizOption[] | null }) | null {
  if (!question) return null;
  return {
    ...question,
    question_text:
      typeof question.question_text === "string"
        ? stripQuizArtifacts(question.question_text)
        : parseOptionText(question.question_text) ?? "",
    correct_answer:
      typeof question.correct_answer === "string"
        ? stripQuizArtifacts(question.correct_answer)
        : parseOptionText(question.correct_answer) ?? "",
    explanation:
      typeof question.explanation === "string"
        ? stripQuizArtifacts(question.explanation)
        : parseOptionText(question.explanation) ?? "",
    options: normalizeQuizOptions(question.options),
  };
}
