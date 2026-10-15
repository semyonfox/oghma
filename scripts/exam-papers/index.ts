import { parseExamFilename, mergeMetadata } from "./metadata.ts";
import { parseQuestionsFromText } from "./questions.ts";
import type { ParseExamPaperOptions, ParsedExamPaper } from "./types.ts";

export function parseExamPaperText(
  rawText: string,
  options: ParseExamPaperOptions = {},
): ParsedExamPaper {
  const sourcePath =
    options.sourcePath ?? options.metadata?.sourcePath ?? "unknown.pdf";
  const inferred = parseExamFilename(sourcePath);

  return {
    metadata: mergeMetadata(inferred, { ...options.metadata, sourcePath }),
    questions: parseQuestionsFromText(rawText),
    rawText,
  };
}

export { parseExamFilename } from "./metadata.ts";
export { parseQuestionsFromText } from "./questions.ts";
export type {
  ExamPaperMetadata,
  ParsedExamPaper,
  ParsedQuestion,
  ParseExamPaperOptions,
} from "./types.ts";

export { extractPaper, parsePdfText } from "./pdf.ts";
export type {
  ExtractedPaper,
  ExtractedPage,
  ExtractedQuestion,
} from "./pdf.ts";
