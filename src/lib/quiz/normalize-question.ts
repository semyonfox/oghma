type QuizOption = { text: string; is_correct: boolean };

function parseOptionsJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function normalizeQuizOptions(value: unknown): QuizOption[] | null {
  if (value == null) return null;

  let source: unknown = value;
  if (typeof source === "string") {
    source = parseOptionsJson(source);
  }

  if (
    source &&
    typeof source === "object" &&
    !Array.isArray(source) &&
    "options" in source
  ) {
    source = (source as { options?: unknown }).options;
  }

  if (!Array.isArray(source)) return null;

  const options = source
    .map((option): QuizOption | null => {
      if (!option || typeof option !== "object") return null;

      const text = (option as { text?: unknown }).text;
      const isCorrect = (option as { is_correct?: unknown }).is_correct;
      if (typeof text !== "string" || typeof isCorrect !== "boolean") {
        return null;
      }

      return { text, is_correct: isCorrect };
    })
    .filter((option): option is QuizOption => option !== null);

  return options.length > 0 ? options : null;
}

export function normalizeQuizQuestion<T extends { options?: unknown }>(
  question: T | null,
): (Omit<T, "options"> & { options: QuizOption[] | null }) | null {
  if (!question) return null;
  return {
    ...question,
    options: normalizeQuizOptions(question.options),
  };
}
