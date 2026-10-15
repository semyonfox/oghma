import type { ParsedQuestion } from "./types.ts";

const QUESTION_HEADING =
  /(?:^|\n)\s*(?:Question\s*(?<questionNumber>\d+|[A-Z])(?:\s*[).:-]\s+|\s+(?!in\s+Section\b))|(?<number>\d+|[A-Z])\s*[).:-]\s+)/gi;
const MARKS_PATTERN = /\[(?<marks>\d+)\s*marks?\]/i;

export function parseQuestionsFromText(rawText: string): ParsedQuestion[] {
  const matches = [...rawText.matchAll(QUESTION_HEADING)];

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? rawText.length;
    const text = rawText.slice(start, end).trim().replace(/\s+/g, " ");
    const marks = MARKS_PATTERN.exec(text)?.groups?.marks;

    return {
      number:
        match.groups?.questionNumber ??
        match.groups?.number ??
        String(index + 1),
      text,
      ...(marks ? { marks: Number.parseInt(marks, 10) } : {}),
      topics: [],
    };
  });
}
