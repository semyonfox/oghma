import type postgres from "postgres";
import type { z } from "zod";
import sql from "@/database/pgsql";
import { ApiError } from "@/lib/api-errors";
import { getSceneReference, pruneAvailableRefs } from "./board-scene";
import { sourceDocument, isCurrentAnchor } from "./evidence";
import { isStudyBinary } from "./source-kind";
import { analyseExamStructure } from "./exam-stats";
import { validatePaperMarksEvidence, validateSectionInstructionPlacement } from "./exam-evidence";
import {
  topicSchema, type StudyTopic, type SourceAnchor, type SourceDocument,
  type mapCreateSchema, type mapUpdateSchema, type topicsUpdateSchema,
  type boardUpdateSchema, type materialUpdateSchema, type paperUpdateSchema,
} from "./types";

type Transaction = postgres.TransactionSql;
export interface LockedStudyMap {
  id: string;
  user_id: string;
  name: string;
  academic_year: string;
  root_note_id: string | null;
  canvas_course_id: string | null;
  syllabus_note_id: string | null;
  version: number;
  board_version: number;
  taxonomy_version: number;
  topics: unknown;
  auto_classify: boolean;
}

export async function lockStudyMap(tx: Transaction, userId: string, mapId: string, version?: number): Promise<LockedStudyMap> {
  // match the note lifecycle lock order before taking map or source row locks
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))`;
  const [map] = await tx<LockedStudyMap[]>`
    SELECT * FROM app.study_maps WHERE user_id = ${userId}::uuid AND id = ${mapId}::uuid FOR UPDATE
  `;
  if (!map) throw new ApiError(404, "Study map not found");
  if (version !== undefined && map.version !== version) throw new ApiError(409, "This map changed in another tab. Refresh and try again.");
  return map;
}

interface SourceRow {
  note_id: string;
  title: string;
  content: string | null;
  extracted_text: string | null;
  s3_key: string | null;
  mime_type: string | null;
}

export async function lockStudySource(tx: Transaction, userId: string, noteId: string): Promise<SourceDocument> {
  const [note] = await tx<SourceRow[]>`
    SELECT n.note_id, n.title, n.content, n.extracted_text, n.s3_key,
      (SELECT a.mime_type FROM app.attachments a
       WHERE a.note_id = n.note_id AND a.user_id = n.user_id AND a.s3_key = n.s3_key
       ORDER BY a.id LIMIT 1) AS mime_type
    FROM app.notes n
    WHERE n.user_id = ${userId}::uuid AND n.note_id = ${noteId}::uuid
      AND n.deleted_at IS NULL AND NOT n.is_folder AND NOT n.is_import_cache_source
      AND EXISTS (SELECT 1 FROM app.tree_items t WHERE t.user_id = n.user_id AND t.note_id = n.note_id)
    FOR SHARE OF n
  `;
  if (!note) throw new ApiError(404, "Source note is no longer available");
  const binary = isStudyBinary(note);
  if (binary) {
    const candidates = await tx<SourceRow[]>`
      SELECT n.note_id, n.title, n.content, n.extracted_text, n.s3_key,
      (SELECT a.mime_type FROM app.attachments a
       WHERE a.note_id = n.note_id AND a.user_id = n.user_id AND a.s3_key = n.s3_key
       ORDER BY a.id LIMIT 1) AS mime_type FROM app.notes n
      WHERE n.user_id = ${userId}::uuid AND n.extracted_from_note_id = ${noteId}::uuid
        AND n.deleted_at IS NULL AND NOT n.is_folder AND NOT n.is_import_cache_source
        AND EXISTS (SELECT 1 FROM app.tree_items t WHERE t.user_id = n.user_id AND t.note_id = n.note_id)
      ORDER BY n.updated_at DESC, n.note_id FOR SHARE OF n
    `;
    const derived = candidates.find((candidate) => !isStudyBinary(candidate));
    if (derived) return boundedSourceDocument({ noteId: derived.note_id, title: derived.title, content: derived.content, extractedText: derived.extracted_text });
  }
  return boundedSourceDocument({ noteId: note.note_id, title: note.title, content: note.content, extractedText: note.extracted_text, isFile: binary });
}

function boundedSourceDocument(input: Parameters<typeof sourceDocument>[0]): SourceDocument {
  try { return sourceDocument(input); }
  catch { throw new ApiError(422, "This material exceeds the study map limits. Split it into smaller notes and try again."); }
}

async function requireNotes(tx: Transaction, userId: string, noteIds: string[], folder?: boolean) {
  if (!noteIds.length) return;
  const unique = [...new Set(noteIds)];
  const rows = await tx<{ note_id: string; is_folder: boolean }[]>`
    SELECT n.note_id, n.is_folder FROM app.notes n
    WHERE n.user_id = ${userId}::uuid AND n.note_id = ANY(${unique}::uuid[])
      AND n.deleted_at IS NULL AND NOT n.is_import_cache_source
      AND EXISTS (SELECT 1 FROM app.tree_items t WHERE t.user_id = n.user_id AND t.note_id = n.note_id)
    FOR SHARE OF n
  `;
  if (rows.length !== unique.length || (folder !== undefined && rows.some((row) => row.is_folder !== folder))) {
    throw new ApiError(404, folder ? "Folder not found" : "One or more notes are unavailable");
  }
}

export async function requireStudyMaterial(tx: Transaction, userId: string, mapId: string, noteId: string) {
  const [material] = await tx`
    SELECT note_id FROM app.study_materials
    WHERE map_id = ${mapId}::uuid AND user_id = ${userId}::uuid AND note_id = ${noteId}::uuid AND NOT excluded
    FOR UPDATE
  `;
  if (!material) throw new ApiError(404, "This note is no longer in the study map");
}

export async function validateStudyAnchors(tx: Transaction, userId: string, anchors: SourceAnchor[]) {
  const notes = new Map<string, SourceDocument>();
  for (const anchor of anchors) {
    let source = notes.get(`${anchor.noteId}:${anchor.field}`);
    if (!source) {
      const [note] = await tx<SourceRow[]>`
        SELECT n.note_id, n.title, n.content, n.extracted_text, n.s3_key,
      (SELECT a.mime_type FROM app.attachments a
       WHERE a.note_id = n.note_id AND a.user_id = n.user_id AND a.s3_key = n.s3_key
       ORDER BY a.id LIMIT 1) AS mime_type FROM app.notes n
        WHERE n.user_id = ${userId}::uuid AND n.note_id = ${anchor.noteId}::uuid
          AND n.deleted_at IS NULL AND NOT n.is_folder AND NOT n.is_import_cache_source
          AND EXISTS (SELECT 1 FROM app.tree_items t WHERE t.user_id = n.user_id AND t.note_id = n.note_id)
        FOR SHARE OF n
      `;
      if (!note) throw new ApiError(409, "An evidence source is no longer available");
      source = boundedSourceDocument({ noteId: note.note_id, title: note.title, content: note.content, extractedText: note.extracted_text, isFile: anchor.field === "extracted_text" });
      notes.set(`${anchor.noteId}:${anchor.field}`, source);
    }
    if (!isCurrentAnchor(anchor, source)) throw new ApiError(409, "A source passage has changed. Review it again before saving.");
  }
}

export function validateStudyTopics(topics: StudyTopic[]) {
  const ids = new Set(topics.map((topic) => topic.id));
  const names = new Set(topics.map((topic) => topic.name.trim().toLocaleLowerCase()));
  if (ids.size !== topics.length || names.size !== topics.length) throw new ApiError(400, "Topic IDs and names must be unique");
  const byId = new Map(topics.map((topic) => [topic.id, topic]));
  for (const topic of topics) {
    const seen = new Set([topic.id]);
    let parent = topic.parentId;
    while (parent) {
      if (!ids.has(parent) || seen.has(parent)) throw new ApiError(400, "Topic hierarchy contains a missing parent or a cycle");
      seen.add(parent);
      parent = byId.get(parent)?.parentId ?? null;
    }
  }
}

function taxonomyMeaning(topics: StudyTopic[]) {
  return JSON.stringify(topics.map(({ id, definition, includes, excludes, aliases, reviewed }) => ({ id, definition, includes, excludes, aliases: [...aliases].sort(), reviewed })).sort((a, b) => a.id.localeCompare(b.id)));
}

async function insertMaterials(tx: Transaction, userId: string, mapId: string, noteIds: string[], explicit: boolean) {
  for (const noteId of new Set(noteIds)) {
    await tx`
      INSERT INTO app.study_materials (map_id, user_id, note_id)
      VALUES (${mapId}::uuid, ${userId}::uuid, ${noteId}::uuid)
      ON CONFLICT (map_id, note_id) DO UPDATE
      SET excluded = CASE WHEN ${explicit} THEN FALSE ELSE app.study_materials.excluded END
    `;
  }
  const [count] = await tx<{ count: number }[]>`
    SELECT count(*)::int AS count FROM app.study_materials WHERE map_id = ${mapId}::uuid AND user_id = ${userId}::uuid AND NOT excluded
  `;
  if (count.count > 500) throw new ApiError(400, "A study map supports up to 500 materials. Choose a smaller folder or a separate module.");
}

export async function createStudyMap(userId: string, input: z.infer<typeof mapCreateSchema>): Promise<string> {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))`;
    if (input.rootNoteId) await requireNotes(tx, userId, [input.rootNoteId], true);
    if (input.syllabusNoteId) await requireNotes(tx, userId, [input.syllabusNoteId], false);
    const [count] = await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM app.study_maps WHERE user_id = ${userId}::uuid`;
    if (count.count >= 100) throw new ApiError(400, "You can create up to 100 study maps");
    const [map] = await tx<{ id: string }[]>`
      INSERT INTO app.study_maps (user_id, name, academic_year, root_note_id, canvas_course_id, syllabus_note_id)
      VALUES (${userId}::uuid, ${input.name}, ${input.academicYear}, ${input.rootNoteId}::uuid, ${input.canvasCourseId}, ${input.syllabusNoteId}::uuid)
      RETURNING id
    `;
    if (input.syllabusNoteId) await insertMaterials(tx, userId, map.id, [input.syllabusNoteId], true);
    return map.id;
  });
}

export async function updateStudyMap(userId: string, mapId: string, input: z.infer<typeof mapUpdateSchema>) {
  await sql.begin(async (tx) => {
    await lockStudyMap(tx, userId, mapId, input.version);
    if (input.rootNoteId) await requireNotes(tx, userId, [input.rootNoteId], true);
    if (input.syllabusNoteId) await requireNotes(tx, userId, [input.syllabusNoteId], false);
    await tx`
      UPDATE app.study_maps SET name = ${input.name}, academic_year = ${input.academicYear},
        root_note_id = ${input.rootNoteId}::uuid, canvas_course_id = ${input.canvasCourseId},
        syllabus_note_id = ${input.syllabusNoteId}::uuid, auto_classify = ${input.autoClassify},
        version = version + 1, updated_at = NOW()
      WHERE id = ${mapId}::uuid AND user_id = ${userId}::uuid
    `;
    if (input.syllabusNoteId) await insertMaterials(tx, userId, mapId, [input.syllabusNoteId], true);
  });
}

export async function deleteStudyMap(userId: string, mapId: string) {
  await sql.begin(async (tx) => {
    await lockStudyMap(tx, userId, mapId);
    await tx`DELETE FROM app.study_maps WHERE user_id = ${userId}::uuid AND id = ${mapId}::uuid`;
  });
}

export async function addStudyMaterials(userId: string, mapId: string, noteIds: string[]) {
  await sql.begin(async (tx) => {
    await lockStudyMap(tx, userId, mapId);
    await requireNotes(tx, userId, noteIds, false);
    await insertMaterials(tx, userId, mapId, noteIds, true);
    const [count] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count FROM app.study_materials WHERE map_id = ${mapId}::uuid AND user_id = ${userId}::uuid AND NOT excluded
    `;
    if (count.count > 500) throw new ApiError(400, "A study map supports up to 500 materials. Use a smaller folder or a separate module.");
    await tx`UPDATE app.study_maps SET updated_at = NOW() WHERE id = ${mapId}::uuid AND user_id = ${userId}::uuid`;
  });
}

export async function syncStudyMaterials(userId: string, mapId: string) {
  await sql.begin(async (tx) => {
    const map = await lockStudyMap(tx, userId, mapId);
    if (!map.root_note_id && !map.canvas_course_id) return;
    const rows = await tx<{ note_id: string }[]>`
      WITH RECURSIVE descendants(note_id) AS (
        SELECT n.note_id FROM app.notes n WHERE n.user_id = ${userId}::uuid
          AND n.note_id = ${map.root_note_id}::uuid AND n.deleted_at IS NULL
        UNION
        SELECT n.note_id FROM app.tree_items t JOIN descendants d ON t.parent_id = d.note_id
          JOIN app.notes n ON n.note_id = t.note_id AND n.user_id = t.user_id
        WHERE t.user_id = ${userId}::uuid AND n.deleted_at IS NULL
      )
      SELECT n.note_id FROM app.notes n
      WHERE n.user_id = ${userId}::uuid AND n.deleted_at IS NULL AND NOT n.is_folder AND NOT n.is_import_cache_source
        AND EXISTS (SELECT 1 FROM app.tree_items t WHERE t.user_id = n.user_id AND t.note_id = n.note_id)
        AND (n.note_id IN (SELECT note_id FROM descendants)
          OR (${map.canvas_course_id}::text IS NOT NULL AND n.canvas_course_id::text = ${map.canvas_course_id}
            AND (n.canvas_academic_year IS NULL OR n.canvas_academic_year = ${map.academic_year})))
      LIMIT 501
    `;
    if (rows.length > 500) throw new ApiError(400, "This folder contains more than 500 materials. Choose a smaller folder.");
    await insertMaterials(tx, userId, mapId, rows.map((row) => row.note_id), false);
  });
}

export async function removeStudyMaterial(userId: string, mapId: string, noteId: string) {
  await sql.begin(async (tx) => {
    await lockStudyMap(tx, userId, mapId);
    await requireStudyMaterial(tx, userId, mapId, noteId);
    await tx`UPDATE app.study_materials SET excluded = TRUE, updated_at = NOW() WHERE user_id = ${userId}::uuid AND map_id = ${mapId}::uuid AND note_id = ${noteId}::uuid`;
    await tx`UPDATE app.study_jobs SET state = 'failed', error = 'This note was removed from the map', lease_until = NULL, lease_token = NULL, updated_at = NOW()
      WHERE user_id = ${userId}::uuid AND map_id = ${mapId}::uuid AND note_id = ${noteId}::uuid AND state IN ('pending', 'running')`;
  });
}

export async function saveStudyTopics(userId: string, mapId: string, input: z.infer<typeof topicsUpdateSchema>) {
  validateStudyTopics(input.topics);
  await sql.begin(async (tx) => {
    const map = await lockStudyMap(tx, userId, mapId, input.version);
    await validateStudyAnchors(tx, userId, input.topics.flatMap((topic) => topic.sources));
    const previous = topicSchema.array().parse(map.topics);
    const changed = taxonomyMeaning(previous) !== taxonomyMeaning(input.topics);
    await tx`
      UPDATE app.study_maps SET topics = ${JSON.stringify(input.topics)}::text::jsonb,
        taxonomy_version = taxonomy_version + ${changed ? 1 : 0}, version = version + 1, updated_at = NOW()
      WHERE id = ${mapId}::uuid AND user_id = ${userId}::uuid
    `;
    if (changed) await tx`UPDATE app.study_materials SET status = 'stale' WHERE user_id = ${userId}::uuid AND map_id = ${mapId}::uuid AND status <> 'unclassified'`;
  });
}

export async function saveStudyBoard(userId: string, mapId: string, input: z.infer<typeof boardUpdateSchema>) {
  return sql.begin(async (tx) => {
    const map = await lockStudyMap(tx, userId, mapId);
    if (map.board_version !== input.version) throw new ApiError(409, "The map layout changed in another tab. Refresh before saving.");
    const topics = topicSchema.array().parse(map.topics);
    const topicIds = new Set(topics.map((topic) => topic.id));
    const materials = await tx<{ note_id: string }[]>`
      SELECT m.note_id FROM app.study_materials m JOIN app.notes n ON n.user_id = m.user_id AND n.note_id = m.note_id
      WHERE m.user_id = ${userId}::uuid AND m.map_id = ${mapId}::uuid AND NOT m.excluded AND n.deleted_at IS NULL
        AND NOT n.is_folder AND NOT n.is_import_cache_source
        AND EXISTS (SELECT 1 FROM app.tree_items tree WHERE tree.note_id = n.note_id AND tree.user_id = n.user_id)
    `;
    const valid = new Set([...topicIds].map((id) => `topic:${id}`).concat(materials.map((row) => `note:${row.note_id}`)));
    const placements = input.board.placements;
    const links = input.board.links;
    if (new Set(placements.map((p) => p.id)).size !== placements.length || new Set(links.map((link) => link.id)).size !== links.length
      || placements.some((p) => !valid.has(p.id) || (p.topicId !== null && !topicIds.has(p.topicId)))
      || links.some((link) => !valid.has(link.source) || !valid.has(link.target))) {
      throw new ApiError(400, "The layout contains duplicate or unavailable cards or links");
    }
    if (input.board.scene?.elements.some((element) => {
      const reference = getSceneReference(element);
      if (reference === null) return false;
      const linkedMap = reference.kind === "topic" && element.link
        ? new URL(element.link, "https://local.invalid").searchParams.get("map")
        : null;
      return !valid.has(`${reference.kind}:${reference.id}`) || (linkedMap !== null && linkedMap !== mapId);
    })) throw new ApiError(400, "The board contains material or topics that are no longer available in this map");
    const board = input.board.scene
      ? { ...input.board, scene: pruneAvailableRefs(input.board.scene, valid) }
      : input.board;
    const [row] = await tx<{ board_version: number }[]>`
      UPDATE app.study_maps SET board = ${JSON.stringify(board)}::text::jsonb, board_version = board_version + 1, updated_at = NOW()
      WHERE id = ${mapId}::uuid AND user_id = ${userId}::uuid RETURNING board_version
    `;
    return row.board_version;
  });
}

export async function reviewStudyMaterial(userId: string, mapId: string, input: z.infer<typeof materialUpdateSchema>) {
  await sql.begin(async (tx) => {
    const map = await lockStudyMap(tx, userId, mapId);
    await requireStudyMaterial(tx, userId, mapId, input.noteId);
    const source = await lockStudySource(tx, userId, input.noteId);
    if (source.hash !== input.sourceHash || map.taxonomy_version !== input.taxonomyVersion) throw new ApiError(409, "The source or topics changed. Refresh and review the labels again.");
    const topics = topicSchema.array().parse(map.topics);
    await validateStudyAnchors(tx, userId, topics.filter((topic) => topic.reviewed).flatMap((topic) => topic.sources));
    const topicIds = new Set(topics.map((topic) => topic.id));
    if (Object.keys(input.topics).some((id) => !topicIds.has(id))) throw new ApiError(400, "Unknown topic");
    const overrides = { kind: input.kind, labels: [...new Set(input.labels)], topics: input.topics, sourceHash: source.hash, taxonomyVersion: map.taxonomy_version };
    await tx`
      UPDATE app.study_materials SET overrides = ${JSON.stringify(overrides)}::text::jsonb, updated_at = NOW()
      WHERE user_id = ${userId}::uuid AND map_id = ${mapId}::uuid AND note_id = ${input.noteId}::uuid
    `;
  });
}

export async function saveStudyPaper(userId: string, mapId: string, input: z.infer<typeof paperUpdateSchema>) {
  await sql.begin(async (tx) => {
    const map = await lockStudyMap(tx, userId, mapId);
    await requireStudyMaterial(tx, userId, mapId, input.noteId);
    const source = await lockStudySource(tx, userId, input.noteId);
    if (source.hash !== input.sourceHash || map.taxonomy_version !== input.taxonomyVersion) throw new ApiError(409, "This paper or its topics changed. Review the current source first.");
    const topics = topicSchema.array().parse(map.topics);
    if (input.reviewed) await validateStudyAnchors(tx, userId, topics.filter((topic) => topic.reviewed).flatMap((topic) => topic.sources));
    const valid = new Set(topics.map((topic) => topic.id));
    if (input.structure.questions.some((q) => q.topicIds.some((id) => !valid.has(id)))) throw new ApiError(400, "The paper refers to an unknown topic");
    const anchors = [...input.structure.questions.map((q) => q.source), ...input.structure.sections.flatMap((section) => section.source ? [section.source] : [])];
    if (anchors.some((anchor) => !isCurrentAnchor(anchor, source))) throw new ApiError(400, "Every question and choice rule must cite an exact passage in this paper");
    if (input.structure.questions.some((question) => !question.source.quote.includes(question.text))) {
      throw new ApiError(400, "Question text must appear in its cited passage");
    }
    if (input.structure.sections.some((section) => section.source !== null && section.instructions !== section.source.quote)) {
      throw new ApiError(400, "Section instructions must match their cited passage");
    }
    if (input.reviewed && input.structure.sections.some((section) => section.answerCount !== section.questionIds.length && !section.source)) {
      throw new ApiError(400, "Cite the choice instructions before approving an optional section");
    }
    if (input.reviewed) {
      try { validateSectionInstructionPlacement(input.structure, source); }
      catch { throw new ApiError(400, "Section instructions could not be verified against this paper. Review their source locations first."); }
      try { validatePaperMarksEvidence(input.structure, source); }
      catch { throw new ApiError(400, "The question marks, paper total, or question coverage could not be verified against the source. Check the quoted marks and include every question before approving."); }
    }
    const analysis = analyseExamStructure(input.structure);
    if (input.reviewed && (analysis.printedMarks === null || analysis.answerableMarks === null)) throw new ApiError(400, "Resolve missing marks and choice rules before approving this paper");
    await tx`
      INSERT INTO app.study_papers (map_id, user_id, note_id, source_hash, taxonomy_version, reviewed, structure)
      VALUES (${mapId}::uuid, ${userId}::uuid, ${input.noteId}::uuid, ${source.hash}, ${map.taxonomy_version}, ${input.reviewed}, ${JSON.stringify(input.structure)}::text::jsonb)
      ON CONFLICT (map_id, note_id) DO UPDATE SET source_hash = EXCLUDED.source_hash,
        taxonomy_version = EXCLUDED.taxonomy_version, reviewed = EXCLUDED.reviewed, structure = EXCLUDED.structure, updated_at = NOW()
    `;
    // a review saved during extraction must win over the pending provider result
    await tx`
      UPDATE app.study_jobs SET state = 'failed', error = 'A saved paper review replaced this analysis',
        lease_until = NULL, lease_token = NULL, updated_at = NOW()
      WHERE user_id = ${userId}::uuid AND map_id = ${mapId}::uuid AND note_id = ${input.noteId}::uuid
        AND kind = 'paper' AND state IN ('pending', 'running')
    `;
  });
}
