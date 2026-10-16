import { z } from "zod";
import { ApiError } from "@/lib/api-errors";
import { isCurrentAnchor } from "./evidence";
import {
  classificationSchema,
  examStructureSchema,
  sourceAnchorSchema,
  type ClassificationResult,
  type ExamStructure,
  type SourceDocument,
  type StudyJobKind,
  type StudyTopic,
} from "./types";

// the pure rules behind study jobs, kept apart from the queue so they can be tested without a database

export const messages = {
  configuration:
    "The study provider is not configured. Configure it before trying again.",
  topics: "Review at least one topic before processing study materials.",
  topicSources:
    "A topic source changed. Refresh and review the topic definitions before processing materials.",
  source:
    "The source note is no longer available. Choose a current source and try again.",
  material:
    "This note is no longer in the study map. Add it again before retrying.",
  map: "This study map is no longer available.",
  changed:
    "The source changed while this job was running. Retry using the current source.",
  mapChanged:
    "The map or topics changed while this job was running. Review them and retry.",
  text: "This material has no readable text. Extract its text first, then try again.",
  size: "This material exceeds the study map limits. Split it into smaller notes and try again.",
  invalid:
    "The result could not be verified against the source. Review the material manually or retry.",
  provider:
    "Study processing failed. Check the provider configuration or review the material, then retry.",
  expired: "This job lost its worker three times. Retry it manually.",
  lease: "This job no longer has an active worker lease.",
} as const;

/** a failure whose message is safe to show the student */
export class StudyJobError extends Error {}

export interface JobInput {
  source: SourceDocument;
  /** topic proposals read the syllabus in full plus the opening of each other material */
  sources: SourceDocument[];
  syllabusNoteId: string | null;
  /** the first source is the syllabus; false when it is excluded, empty or oversized */
  syllabusIncluded: boolean;
  topics: StudyTopic[];
  version: number;
  taxonomyVersion: number;
  academicYear: string;
  noteId: string;
}

/** the message stored on a failed job; provider bodies and stack traces never reach it */
export function failureMessage(error: unknown, aborted: boolean): string {
  if (aborted) return messages.lease;
  if (error instanceof StudyJobError) return error.message;
  if (error instanceof ApiError) {
    if (
      error.userMessage === messages.configuration ||
      error.userMessage === messages.topics ||
      error.userMessage === messages.topicSources
    )
      return error.userMessage;
    if (error.statusCode === 404) return messages.map;
  }
  if (error instanceof z.ZodError) return messages.invalid;
  return messages.provider;
}

/**
 * whether the map moved on in a way that invalidates a finished result. a proposal
 * replaces the whole catalogue, so any map edit wins over it; classification and
 * paper analysis depend only on topic meaning, which taxonomyVersion tracks, so a
 * rename or settings change does not throw away a paid result
 */
export function mapChangedSince(
  kind: StudyJobKind,
  map: {
    version: number;
    taxonomy_version: number;
    syllabus_note_id: string | null;
    academic_year: string;
  },
  input: JobInput,
): boolean {
  if (kind === "taxonomy")
    return (
      map.version !== input.version ||
      map.syllabus_note_id !== input.syllabusNoteId
    );
  return (
    map.taxonomy_version !== input.taxonomyVersion ||
    (kind === "paper" && map.academic_year !== input.academicYear)
  );
}

export function validateClassification(
  result: ClassificationResult,
  source: SourceDocument,
  topics: StudyTopic[],
): ClassificationResult {
  const parsed = classificationSchema.parse(result);
  const ids = new Set(
    topics.filter((topic) => topic.reviewed).map((topic) => topic.id),
  );
  if (
    new Set(parsed.associations.map((item) => item.topicId)).size !==
      parsed.associations.length ||
    parsed.associations.some(
      (item) =>
        !ids.has(item.topicId) ||
        !item.evidence.length ||
        item.evidence.some(
          (evidence) => !isCurrentAnchor(evidence.anchor, source),
        ),
    )
  ) {
    throw new StudyJobError(messages.invalid);
  }
  const raw = z
    .array(
      z.object({
        passageId: z.string(),
        anchor: sourceAnchorSchema,
        judgements: z.array(
          z.object({
            questionId: z.string(),
            answer: z.unknown(),
            model: z.string(),
          }),
        ),
      }),
    )
    .max(500)
    .parse(parsed.rawDecisions);
  if (raw.some((decision) => !isCurrentAnchor(decision.anchor, source)))
    throw new StudyJobError(messages.invalid);
  return { ...parsed, rawDecisions: raw };
}

export function validatePaper(
  result: ExamStructure,
  source: SourceDocument,
  topics: StudyTopic[],
): ExamStructure {
  const structure = examStructureSchema.parse(result);
  const ids = new Set(topics.map((topic) => topic.id));
  if (
    structure.questions.some(
      (question) =>
        question.topicIds.some((id) => !ids.has(id)) ||
        !isCurrentAnchor(question.source, source) ||
        !question.source.quote.includes(question.text),
    ) ||
    structure.sections.some(
      (section) =>
        section.source !== null &&
        (!isCurrentAnchor(section.source, source) ||
          section.instructions !== section.source.quote),
    )
  ) {
    throw new StudyJobError(messages.invalid);
  }
  // generation validates question parents, marks and choice rules before returning
  return structure;
}

export const MAX_TAXONOMY_SOURCES = 60;
const TAXONOMY_BUDGET_CHARS = 80_000;
const MIN_PREVIEW_CHARS = 600;
const RICH_SYLLABUS_CHARS = 1_500;

/** fits every material's opening into one generation call; the syllabus, when included, stays whole */
export function taxonomyPreview(
  input: Pick<JobInput, "sources" | "syllabusIncluded">,
): {
  sources: SourceDocument[];
  previewChars: number;
  fullSources: number;
} {
  const fullSources = input.syllabusIncluded ? 1 : 0;
  const whole = fullSources ? input.sources[0].text.length : 0;
  // a substantial outline already names the teaching units, so lectures would only add cost
  if (whole >= RICH_SYLLABUS_CHARS)
    return { sources: input.sources.slice(0, 1), fullSources, previewChars: 0 };
  const room = Math.max(0, TAXONOMY_BUDGET_CHARS - whole);
  // past the budget, later materials are left out rather than shrinking every preview to nothing
  const previews = Math.min(
    input.sources.length - fullSources,
    Math.floor(room / MIN_PREVIEW_CHARS),
  );
  return {
    sources: input.sources.slice(
      0,
      fullSources + Math.max(previews, fullSources ? 0 : 1),
    ),
    fullSources,
    previewChars: Math.min(
      3_000,
      Math.max(MIN_PREVIEW_CHARS, Math.floor(room / Math.max(previews, 1))),
    ),
  };
}
