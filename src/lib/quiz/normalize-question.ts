type QuizOption = { text: string; is_correct: boolean };

// marker page-rank artifacts: lines like `{0}----` or ` {12}--------`
const MARKER_ARTIFACT_RE = /^\s*\{\d+\}-+\s*$/gm;

function stripArtifacts(text: string): string {
  return text.replace(MARKER_ARTIFACT_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

function parseOptionsJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isTrueFalse(options: QuizOption[]): boolean {
  return (
    options.length === 2 &&
    options.some((o) => o.text === "True") &&
    options.some((o) => o.text === "False")
  );
}

function shuffleOptions(options: QuizOption[]): QuizOption[] {
  if (isTrueFalse(options)) return options; // keep True/False in conventional order
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

      return { text: stripArtifacts(text), is_correct: isCorrect };
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
        ? stripArtifacts(question.question_text)
        : question.question_text,
    correct_answer:
      typeof question.correct_answer === "string"
        ? stripArtifacts(question.correct_answer)
        : question.correct_answer,
    explanation:
      typeof question.explanation === "string"
        ? stripArtifacts(question.explanation)
        : question.explanation,
    options: normalizeQuizOptions(question.options),
  };
}
