"use client";

import { z } from "zod";
import {
  boardSchema,
  documentKindSchema,
  examStructureSchema,
  materialOverridesSchema,
  topicAssociationSchema,
  topicSchema,
} from "@/lib/study-map/types";

export const summarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  academicYear: z.string(),
  topicCount: z.number(),
  materialCount: z.number(),
  updatedAt: z.string(),
});
export const snapshotSchema = z.object({
  map: summarySchema.extend({
    rootNoteId: z.uuid().nullable(),
    canvasCourseId: z.string().nullable(),
    syllabusNoteId: z.uuid().nullable(),
    taxonomyVersion: z.number().int(),
    version: z.number().int(),
    boardVersion: z.number().int(),
    autoClassify: z.boolean(),
    topics: topicSchema.array(),
    board: boardSchema,
  }),
  materials: z
    .object({
      noteId: z.uuid(),
      mapId: z.uuid(),
      title: z.string(),
      excerpt: z.string(),
      kind: documentKindSchema,
      labels: z.string().array(),
      associations: topicAssociationSchema.array(),
      overrides: materialOverridesSchema,
      status: z.enum(["unclassified", "classified", "stale", "failed"]),
      sourceHash: z.string(),
      currentHash: z.string(),
      taxonomyVersion: z.number().int(),
      taxonomyEvidenceStale: z.boolean().optional(),
      updatedAt: z.string(),
      classifiedAt: z.string().nullable(),
      isFile: z.boolean(),
      mimeType: z.string().nullable(),
      references: z
        .object({
          id: z.uuid(),
          title: z.string(),
          kind: z.enum(["note", "file", "embedded"]),
          relation: z.enum(["embedded", "extraction", "attachment"]),
        })
        .array(),
      folder: z.string().nullable(),
      createdAt: z.string(),
      imported: z.boolean(),
    })
    .array(),
  assignments: z
    .object({
      id: z.uuid(),
      canvas_course_id: z.string().nullable(),
      canvas_assignment_id: z.string().nullable(),
      title: z.string(),
      description: z.string().nullable(),
      course_name: z.string().nullable(),
      course_color: z.string().nullable(),
      due_at: z.string().nullable(),
      status: z.enum(["upcoming", "in_progress", "done", "late"]),
      estimated_hours: z.number().nullable(),
      logged_hours: z.number(),
      source: z.enum(["canvas", "manual"]),
      assignment_type: z.enum(["quiz", "assignment", "manual", "unknown"]),
      submitted_at: z.string().nullable(),
      score: z.number().nullable(),
      points_possible: z.number().nullable(),
      created_at: z.string(),
      updated_at: z.string(),
      noteIds: z.uuid().array(),
    })
    .array(),
  papers: z
    .object({
      noteId: z.uuid(),
      title: z.string(),
      sourceHash: z.string(),
      currentHash: z.string(),
      taxonomyVersion: z.number().int(),
      reviewed: z.boolean(),
      structure: examStructureSchema,
    })
    .array(),
  jobs: z
    .object({
      id: z.uuid(),
      kind: z.enum(["taxonomy", "classify", "paper"]),
      noteId: z.uuid().nullable(),
      state: z.enum(["pending", "running", "completed", "failed"]),
      error: z.string().nullable(),
      createdAt: z.string(),
    })
    .array(),
  provider: z.object({
    classifier: z.enum(["jev", "generative", "mock"]),
    ready: z.boolean(),
    generationReady: z.boolean(),
  }),
});
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function messageFor(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request could not be completed. Try again.";
}

export async function requestJson(
  url: string,
  options?: RequestInit,
): Promise<unknown> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    },
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = z.object({ error: z.string() }).safeParse(data);
    throw new RequestError(
      failure.success
        ? failure.data.error
        : `The request failed (${response.status}). Try again.`,
      response.status,
    );
  }
  return data;
}
