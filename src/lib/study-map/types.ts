import { z } from "zod";

export const documentKinds = ["notes", "slides", "syllabus", "past_paper", "worked_example", "reading", "other"] as const;
export const documentKindSchema = z.enum(documentKinds);
export type DocumentKind = z.infer<typeof documentKindSchema>;
export const relevanceSchema = z.enum(["core", "supporting"]);
export type Relevance = z.infer<typeof relevanceSchema>;

export const sourceAnchorSchema = z.object({
  noteId: z.uuid(),
  field: z.enum(["content", "extracted_text"]),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  quote: z.string().min(1).max(8_000),
  line: z.number().int().positive(),
  page: z.number().int().positive().nullable(),
}).refine((value) => value.end > value.start, "Source end must follow its start");
export type SourceAnchor = z.infer<typeof sourceAnchorSchema>;

export interface SourceDocument {
  noteId: string;
  title: string;
  text: string;
  field: "content" | "extracted_text";
  hash: string;
}

export interface SourcePassage {
  id: string;
  text: string;
  anchor: SourceAnchor;
}

export const topicSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  definition: z.string().trim().min(1).max(2_000),
  includes: z.string().max(1_000).default(""),
  excludes: z.string().max(1_000).default(""),
  aliases: z.array(z.string().trim().min(1).max(100)).max(12).default([]),
  parentId: z.uuid().nullable().default(null),
  sources: z.array(sourceAnchorSchema).max(8).default([]),
  reviewed: z.boolean().default(false),
});
export type StudyTopic = z.infer<typeof topicSchema>;

export const topicEvidenceSchema = z.object({
  anchor: sourceAnchorSchema,
  relevance: relevanceSchema,
  probability: z.number().min(0).max(1).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});
export const topicAssociationSchema = z.object({
  topicId: z.uuid(),
  relevance: relevanceSchema,
  probability: z.number().min(0).max(1).nullable(),
  evidence: z.array(topicEvidenceSchema).max(200),
  status: z.enum(["suggested", "accepted", "rejected"]),
  origin: z.enum(["automatic", "manual"]).default("automatic"),
});
export type TopicAssociation = z.infer<typeof topicAssociationSchema>;

export const materialOverridesSchema = z.object({
  kind: documentKindSchema.optional(),
  labels: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  topics: z.record(z.uuid(), z.enum(["core", "supporting", "excluded"])).default({}),
  sourceHash: z.string().default(""),
  taxonomyVersion: z.number().int().nonnegative().default(0),
});
export type MaterialOverrides = z.infer<typeof materialOverridesSchema>;

export const classificationSchema = z.object({
  kind: documentKindSchema,
  labels: z.array(z.string().max(60)).max(20),
  associations: z.array(topicAssociationSchema).max(80),
  model: z.string().max(200),
  promptVersion: z.string().max(40),
  cost: z.number().nonnegative().nullable(),
  inputTokens: z.number().int().nonnegative(),
  rawDecisions: z.array(z.unknown()).max(500),
});
export type ClassificationResult = z.infer<typeof classificationSchema>;

export interface MaterialReference {
  id: string;
  title: string;
  kind: "note" | "file" | "embedded";
}

export interface StudyMaterial {
  noteId: string;
  mapId: string;
  title: string;
  excerpt: string;
  kind: DocumentKind;
  labels: string[];
  associations: TopicAssociation[];
  overrides: MaterialOverrides;
  status: "unclassified" | "classified" | "stale" | "failed";
  sourceHash: string;
  currentHash: string;
  taxonomyVersion: number;
  updatedAt: string;
  taxonomyEvidenceStale?: boolean;
  classifiedAt: string | null;
  isFile: boolean;
  mimeType: string | null;
  references: MaterialReference[];
}

export const boardPlacementSchema = z.object({
  id: z.string().regex(/^(note|topic):[a-f0-9-]{36}$/),
  x: z.number().finite().min(-100_000).max(100_000),
  y: z.number().finite().min(-100_000).max(100_000),
  pinned: z.boolean(),
  topicId: z.uuid().nullable().default(null),
});
export const boardLinkSchema = z.object({
  id: z.uuid(),
  source: z.string().regex(/^(note|topic):[a-f0-9-]{36}$/),
  target: z.string().regex(/^(note|topic):[a-f0-9-]{36}$/),
  label: z.string().trim().min(1).max(80),
}).refine((value) => value.source !== value.target, "Choose two different cards");
export const boardSchema = z.object({
  placements: z.array(boardPlacementSchema).max(1_000),
  links: z.array(boardLinkSchema).max(1_000),
  viewport: z.object({
    x: z.number().finite().min(-1_000_000).max(1_000_000),
    y: z.number().finite().min(-1_000_000).max(1_000_000),
    zoom: z.number().min(0.1).max(3),
  }).nullable(),
});
export type StudyBoard = z.infer<typeof boardSchema>;
export type BoardPlacement = z.infer<typeof boardPlacementSchema>;
export type BoardLink = z.infer<typeof boardLinkSchema>;

export const examQuestionSchema = z.object({
  id: z.string().min(1).max(80),
  parentId: z.string().max(80).nullable(),
  label: z.string().min(1).max(100),
  text: z.string().min(1).max(12_000),
  marks: z.number().nonnegative().max(10_000).nullable(),
  topicIds: z.array(z.uuid()).max(20),
  style: z.string().max(100),
  source: sourceAnchorSchema,
});
export const examSectionSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  questionIds: z.array(z.string().max(80)).min(1).max(200),
  answerCount: z.number().int().positive().max(200).nullable(),
  instructions: z.string().max(2_000),
  source: sourceAnchorSchema.nullable(),
});
export const examStructureSchema = z.object({
  year: z.number().int().min(1900).max(2200),
  sitting: z.string().trim().min(1).max(100),
  syllabusVersion: z.string().trim().min(1).max(100),
  statedTotalMarks: z.number().nonnegative().max(10_000).nullable(),
  sections: z.array(examSectionSchema).min(1).max(40),
  questions: z.array(examQuestionSchema).min(1).max(400),
  warnings: z.array(z.string().max(500)).max(40),
});
export type ExamQuestion = z.infer<typeof examQuestionSchema>;
export type ExamSection = z.infer<typeof examSectionSchema>;
export type ExamStructure = z.infer<typeof examStructureSchema>;

export interface StudyPaper {
  noteId: string;
  title: string;
  sourceHash: string;
  currentHash: string;
  taxonomyVersion: number;
  reviewed: boolean;
  structure: ExamStructure;
}

export const studyJobKinds = ["taxonomy", "classify", "paper"] as const;
export type StudyJobKind = typeof studyJobKinds[number];
export interface StudyJob {
  id: string;
  kind: StudyJobKind;
  noteId: string | null;
  state: "pending" | "running" | "completed" | "failed";
  error: string | null;
  createdAt: string;
}

export interface StudyMapSummary {
  id: string;
  name: string;
  academicYear: string;
  topicCount: number;
  materialCount: number;
  updatedAt: string;
}

export interface StudyMap extends StudyMapSummary {
  rootNoteId: string | null;
  canvasCourseId: string | null;
  syllabusNoteId: string | null;
  taxonomyVersion: number;
  version: number;
  boardVersion: number;
  autoClassify: boolean;
  topics: StudyTopic[];
  board: StudyBoard;
}

export interface StudyMapSnapshot {
  map: StudyMap;
  materials: StudyMaterial[];
  papers: StudyPaper[];
  jobs: StudyJob[];
  provider: { classifier: "jev" | "generative" | "mock"; ready: boolean; generationReady: boolean };
}

export const mapCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  academicYear: z.string().trim().min(1).max(40),
  rootNoteId: z.uuid().nullable().default(null),
  canvasCourseId: z.string().regex(/^\d+$/).max(30).nullable().default(null),
  syllabusNoteId: z.uuid().nullable().default(null),
});
export const mapUpdateSchema = mapCreateSchema.extend({
  version: z.number().int().positive(),
  autoClassify: z.boolean(),
});
export const topicsUpdateSchema = z.object({
  version: z.number().int().positive(),
  topics: z.array(topicSchema).max(80),
});
export const boardUpdateSchema = z.object({
  version: z.number().int().nonnegative(),
  board: boardSchema,
});
export const materialsAddSchema = z.object({ noteIds: z.array(z.uuid()).min(1).max(100) });
export const materialUpdateSchema = z.object({
  noteId: z.uuid(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  taxonomyVersion: z.number().int().positive(),
  kind: documentKindSchema,
  labels: z.array(z.string().trim().min(1).max(60)).max(20),
  topics: z.record(z.uuid(), z.enum(["core", "supporting", "excluded"])),
});
export const jobCreateSchema = z.object({
  kind: z.enum(studyJobKinds),
  noteId: z.uuid().nullable().default(null),
});
export const paperUpdateSchema = z.object({
  noteId: z.uuid(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  taxonomyVersion: z.number().int().positive(),
  reviewed: z.boolean(),
  structure: examStructureSchema,
});

export const emptyBoard = (): StudyBoard => ({ placements: [], links: [], viewport: null });

export function effectiveAssociations(material: StudyMaterial, taxonomyVersion: number): TopicAssociation[] {
  const correctionsCurrent = material.overrides.sourceHash === material.currentHash
    && material.overrides.taxonomyVersion === taxonomyVersion && !material.taxonomyEvidenceStale;
  const corrections = correctionsCurrent ? material.overrides.topics : {};
  const associations = new Map(material.associations.map((association) => [association.topicId, association]));
  for (const [topicId, relevance] of Object.entries(corrections)) {
    if (relevance === "excluded") associations.delete(topicId);
    else associations.set(topicId, {
      topicId, relevance, probability: null,
      evidence: associations.get(topicId)?.evidence ?? [], status: "accepted", origin: "manual",
    });
  }
  return [...associations.values()].filter((association) => association.status !== "rejected");
}
