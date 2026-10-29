import { z } from "zod";
import { documentKindSchema, type DocumentKind } from "@/lib/study-map/types";

// one document in the Tags view. a PDF and the note extracted from it share a row
export const tagsViewFileSchema = z.object({
  /** what opens when the row is clicked: the PDF for a pair, otherwise the note or file */
  id: z.string(),
  /** the note that holds #tags, null for a PDF with no extracted note */
  noteId: z.string().nullable(),
  title: z.string(),
  /** folders between the course and the file */
  path: z.string(),
  /** the top-level folder it sits in */
  rootId: z.string(),
  isFile: z.boolean(),
  mimeType: z.string().nullable(),
  main: z.boolean(),
  suggested: z.boolean(),
  /** what the study map says the document is, null when no map holds it */
  kind: documentKindSchema.nullable(),
});
export type TagsViewFile = z.infer<typeof tagsViewFileSchema>;

/** Q1: a file with topics waiting for a decision */
export const tagsViewReviewSchema = tagsViewFileSchema.extend({
  /** a correction went stale because the file or the topic list changed */
  changed: z.boolean(),
  topics: z.array(
    z.object({
      mapId: z.string(),
      topicId: z.string(),
      name: z.string(),
      topicIndex: z.number().int().nonnegative(),
    }),
  ),
});
export type TagsViewReview = z.infer<typeof tagsViewReviewSchema>;

export const tagsViewTopicSchema = z.object({
  mapId: z.string(),
  topicId: z.string(),
  name: z.string(),
  topicIndex: z.number().int().nonnegative(),
  /** confirmed files only, suggestions are listed under To review */
  files: z.array(tagsViewFileSchema),
  suggestedCount: z.number().int().nonnegative(),
});
export type TagsViewTopic = z.infer<typeof tagsViewTopicSchema>;

export const tagsViewCourseSchema = z.object({
  rootId: z.string(),
  title: z.string(),
  maps: z.array(z.object({ id: z.string(), name: z.string() })),
  topics: z.array(tagsViewTopicSchema),
  review: z.array(tagsViewReviewSchema),
  untagged: z.array(tagsViewFileSchema),
});
export type TagsViewCourse = z.infer<typeof tagsViewCourseSchema>;

export const tagsViewSchema = z.object({
  tags: z.array(z.object({ tag: z.string(), files: z.array(tagsViewFileSchema) })),
  courses: z.array(tagsViewCourseSchema),
});
export type TagsViewData = z.infer<typeof tagsViewSchema>;

export const MAX_TAGS_VIEW_ROOTS = 50;

// F3: a topic reads top to bottom as lectures, then papers, then your own notes
const KIND_ORDER: readonly DocumentKind[] = [
  "slides",
  "past_paper",
  "worked_example",
  "reading",
  "notes",
  "syllabus",
  "other",
];

export interface KindGroup {
  kind: DocumentKind;
  files: TagsViewFile[];
}

/**
 * Split a topic's files by document kind. When every file is the same kind a
 * header would say nothing, so that comes back as one group the view shows
 * without a label. Otherwise each kind present gets a label, even with one
 * file, so a lone past paper is still easy to spot.
 */
export function groupByKind(files: readonly TagsViewFile[]): KindGroup[] {
  const groups = new Map<DocumentKind, TagsViewFile[]>();
  for (const file of files) {
    const kind = file.kind ?? "other";
    groups.set(kind, [...(groups.get(kind) ?? []), file]);
  }
  return KIND_ORDER.flatMap((kind) => {
    const grouped = groups.get(kind);
    return grouped ? [{ kind, files: grouped }] : [];
  });
}

export const classificationProgressSchema = z.object({
  total: z.number().int().nonnegative(),
  classified: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  waitingForText: z.number().int().nonnegative(),
  activeJobs: z.number().int().nonnegative(),
  autoClassify: z.boolean(),
  runStartedAt: z.string().nullable(),
  completions: z.array(z.string()),
});
