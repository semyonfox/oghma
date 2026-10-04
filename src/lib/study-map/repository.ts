import { z } from "zod";
import sql from "@/database/pgsql";
import { ApiError } from "@/lib/api-errors";
import { pruneAvailableRefs } from "./board-scene";
import { isStudyBinary } from "./source-kind";
import { studyProviderStatus } from "./config";
import { isCurrentAnchor, sourceDocument, sourceExcerpt } from "./evidence";
import {
  boardSchema,
  documentKindSchema,
  examStructureSchema,
  materialOverridesSchema,
  topicAssociationSchema,
  topicSchema,
  type MaterialReference,
  type SourceAnchor,
  type SourceDocument,
  type StudyJob,
  type StudyMap,
  type StudyMapSnapshot,
  type StudyMapSummary,
  type StudyMaterial,
  type StudyPaper,
  type StudyTopic,
} from "./types";

interface MapRow {
  id: string;
  name: string;
  academic_year: string;
  root_note_id: string | null;
  canvas_course_id: string | null;
  syllabus_note_id: string | null;
  topics: unknown;
  taxonomy_version: number;
  version: number;
  board_version: number;
  board: unknown;
  auto_classify: boolean;
  material_count: number;
  updated_at: Date | string;
}

interface NoteRow {
  note_id: string;
  title: string | null;
  content: string | null;
  extracted_text: string | null;
  s3_key: string | null;
  mime_type: string | null;
  extracted_from_note_id: string | null;
  updated_at: Date | string;
}

interface MaterialRow {
  note_id: string;
  map_id: string;
  kind: unknown;
  labels: unknown;
  associations: unknown;
  overrides: unknown;
  source_hash: string;
  taxonomy_version: number;
  status: unknown;
  updated_at: Date | string;
  classified_at: Date | string | null;
  source_note_id?: string | null;
  source_field?: string | null;
}

interface PaperRow {
  note_id: string;
  source_hash: string;
  taxonomy_version: number;
  reviewed: boolean;
  structure: unknown;
}

interface ReferenceRow {
  source_id: string;
  target_id: string;
  title: string | null;
  s3_key: string | null;
  mime_type: string | null;
  relation: "embedded" | "extraction" | "attachment";
}

interface JobRow {
  id: string;
  kind: unknown;
  note_id: string | null;
  state: unknown;
  error: string | null;
  created_at: Date | string;
}

const topicsSchema = z.array(topicSchema).max(80);
const associationsSchema = z.array(topicAssociationSchema).max(80);
const labelsSchema = z.array(z.string().max(60)).max(20);
const statusSchema = z.enum(["unclassified", "classified", "stale", "failed"]);
const jobKindSchema = z.enum(["taxonomy", "classify", "paper"]);
const jobStateSchema = z.enum(["pending", "running", "completed", "failed"]);
const MAX_SOURCE_CHARS = 320_000;

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function readMaps(userId: string, mapId: string | null = null): Promise<MapRow[]> {
  return sql<MapRow[]>`
    SELECT m.id, m.name, m.academic_year, m.root_note_id, m.canvas_course_id,
      m.syllabus_note_id, m.topics, m.taxonomy_version, m.version, m.board_version,
      m.board, m.auto_classify, m.updated_at,
      (SELECT count(*)::int FROM app.study_materials material
       JOIN app.notes n ON n.note_id = material.note_id AND n.user_id = material.user_id
       WHERE material.map_id = m.id AND material.user_id = m.user_id AND material.excluded = FALSE
         AND n.deleted_at IS NULL AND n.is_folder = FALSE AND n.is_import_cache_source = FALSE
         AND EXISTS (SELECT 1 FROM app.tree_items tree
           WHERE tree.note_id = n.note_id AND tree.user_id = n.user_id)) AS material_count
    FROM app.study_maps m
    WHERE m.user_id = ${userId}::uuid AND (${mapId}::uuid IS NULL OR m.id = ${mapId}::uuid)
    ORDER BY m.updated_at DESC, m.id
  `;
}

function summary(row: MapRow): StudyMapSummary {
  return {
    id: row.id,
    name: row.name,
    academicYear: row.academic_year,
    topicCount: topicsSchema.parse(row.topics).length,
    materialCount: row.material_count,
    updatedAt: timestamp(row.updated_at),
  };
}

async function readNotes(userId: string, noteIds: string[]): Promise<NoteRow[]> {
  if (!noteIds.length) return [];
  return sql<NoteRow[]>`
    SELECT n.note_id, n.title, n.content, n.extracted_text, n.s3_key,
      n.extracted_from_note_id, n.updated_at,
      (SELECT a.mime_type FROM app.attachments a
       WHERE a.note_id = n.note_id AND a.user_id = n.user_id AND a.s3_key = n.s3_key
       ORDER BY a.id LIMIT 1) AS mime_type
    FROM app.notes n
    WHERE n.user_id = ${userId}::uuid AND n.note_id = ANY(${noteIds}::uuid[])
      AND n.deleted_at IS NULL AND n.is_folder = FALSE AND n.is_import_cache_source = FALSE
      AND EXISTS (SELECT 1 FROM app.tree_items tree
        WHERE tree.note_id = n.note_id AND tree.user_id = n.user_id)
  `;
}

async function readDerivedNotes(userId: string, noteIds: string[]): Promise<NoteRow[]> {
  if (!noteIds.length) return [];
  return sql<NoteRow[]>`
    SELECT n.note_id, n.title, n.content, n.extracted_text, n.s3_key,
      n.extracted_from_note_id, n.updated_at,
      (SELECT a.mime_type FROM app.attachments a
       WHERE a.note_id = n.note_id AND a.user_id = n.user_id AND a.s3_key = n.s3_key
       ORDER BY a.id LIMIT 1) AS mime_type
    FROM app.notes n
    WHERE n.user_id = ${userId}::uuid AND n.extracted_from_note_id = ANY(${noteIds}::uuid[])
      AND n.deleted_at IS NULL AND n.is_folder = FALSE AND n.is_import_cache_source = FALSE
      AND EXISTS (SELECT 1 FROM app.tree_items tree
        WHERE tree.note_id = n.note_id AND tree.user_id = n.user_id)
    ORDER BY n.updated_at DESC, n.note_id
  `;
}


function documentFor(note: NoteRow, derivedNotes: NoteRow[], enforceLimit = true): SourceDocument {
  const binary = isStudyBinary({ ...note, title: note.title ?? "" });
  const derived = binary ? derivedNotes.find((candidate) =>
    candidate.extracted_from_note_id === note.note_id && !isStudyBinary({ ...candidate, title: candidate.title ?? "" })) : undefined;
  const canonical = derived ?? note;
  try {
    return sourceDocument({
      noteId: canonical.note_id,
      title: canonical.title ?? "Untitled",
      content: canonical.content,
      extractedText: canonical.extracted_text,
      isFile: binary && !derived,
      enforceLimit,
    });
  } catch (error) {
    throw new ApiError(422, error instanceof Error ? error.message : "Split this material into smaller notes and try again.");
  }
}

function redactTopics(topics: StudyTopic[], sourceNotes: NoteRow[]): StudyTopic[] {
  const notes = new Map(sourceNotes.map((note) => [note.note_id, note]));
  const documents = new Map<string, SourceDocument | null>();
  const currentSource = (anchor: SourceAnchor): SourceDocument | null => {
    const key = `${anchor.noteId}:${anchor.field}`;
    if (!documents.has(key)) {
      const note = notes.get(anchor.noteId);
      let source: SourceDocument | null = null;
      if (note) {
        try {
          source = sourceDocument({
            noteId: note.note_id,
            title: note.title ?? "Untitled",
            content: note.content,
            extractedText: note.extracted_text,
            isFile: anchor.field === "extracted_text",
          });
        } catch {
          // oversized source edits invalidate review without making the map unreadable
        }
      }
      documents.set(key, source);
    }
    return documents.get(key) ?? null;
  };
  return topics.map((topic) => {
    const sources = topic.sources.filter((anchor) => notes.has(anchor.noteId));
    const reviewed = topic.reviewed && sources.length === topic.sources.length && sources.every((anchor) => {
      const source = currentSource(anchor);
      return source !== null && isCurrentAnchor(anchor, source);
    });
    return { ...topic, sources, reviewed };
  });
}

async function mapFromRow(userId: string, row: MapRow): Promise<StudyMap> {
  const topics = topicsSchema.parse(row.topics);
  const sourceIds = [...new Set(topics.flatMap((topic) => topic.sources.map((source) => source.noteId)))];
  const [sourceNotes, visibleRoots, materials] = await Promise.all([
    readNotes(userId, sourceIds),
    sql<Array<{ note_id: string; is_folder: boolean }>>`
      SELECT n.note_id, n.is_folder FROM app.notes n
      WHERE n.user_id = ${userId}::uuid
        AND n.note_id = ANY(${[row.root_note_id, row.syllabus_note_id].filter((id): id is string => id !== null)}::uuid[])
        AND n.deleted_at IS NULL AND n.is_import_cache_source = FALSE
        AND EXISTS (SELECT 1 FROM app.tree_items tree
          WHERE tree.note_id = n.note_id AND tree.user_id = n.user_id)
    `,
    sql<Array<{ note_id: string }>>`
      SELECT material.note_id FROM app.study_materials material
      JOIN app.notes n ON n.note_id = material.note_id AND n.user_id = material.user_id
      WHERE material.map_id = ${row.id}::uuid AND material.user_id = ${userId}::uuid AND material.excluded = FALSE
        AND n.deleted_at IS NULL AND n.is_folder = FALSE AND n.is_import_cache_source = FALSE
        AND EXISTS (SELECT 1 FROM app.tree_items tree
          WHERE tree.note_id = n.note_id AND tree.user_id = n.user_id)
    `,
  ]);
  const board = boardSchema.parse(row.board);
  const cardIds = new Set([
    ...topics.map((topic) => `topic:${topic.id}`),
    ...materials.map((material) => `note:${material.note_id}`),
  ]);
  return {
    ...summary(row),
    rootNoteId: visibleRoots.some((note) => note.note_id === row.root_note_id) ? row.root_note_id : null,
    canvasCourseId: row.canvas_course_id,
    syllabusNoteId: visibleRoots.some((note) => note.note_id === row.syllabus_note_id && !note.is_folder)
      ? row.syllabus_note_id : null,
    taxonomyVersion: row.taxonomy_version,
    version: row.version,
    boardVersion: row.board_version,
    autoClassify: row.auto_classify,
    topics: redactTopics(topics, sourceNotes),
    board: {
      ...board,
      ...(board.scene ? { scene: pruneAvailableRefs(board.scene, cardIds) } : {}),
      placements: board.placements.filter((placement) => cardIds.has(placement.id)).map((placement) => ({
        ...placement,
        topicId: placement.topicId && topics.some((topic) => topic.id === placement.topicId) ? placement.topicId : null,
      })),
      links: board.links.filter((link) => cardIds.has(link.source) && cardIds.has(link.target)),
    },
  };
}

export async function listStudyMaps(userId: string): Promise<StudyMapSummary[]> {
  return (await readMaps(userId)).map(summary);
}

export async function getStudyMap(userId: string, mapId: string): Promise<StudyMap> {
  const [row] = await readMaps(userId, mapId);
  if (!row) throw new ApiError(404, "Study map not found");
  return mapFromRow(userId, row);
}

export async function loadStudySource(userId: string, noteId: string): Promise<SourceDocument> {
  const [note] = await readNotes(userId, [noteId]);
  if (!note) throw new ApiError(404, "Study material not found");
  const derived = isStudyBinary({ ...note, title: note.title ?? "" }) ? await readDerivedNotes(userId, [noteId]) : [];
  return documentFor(note, derived);
}

async function readReferences(userId: string, noteIds: string[]): Promise<ReferenceRow[]> {
  if (!noteIds.length) return [];
  return sql<ReferenceRow[]>`
    WITH active_notes AS (
      SELECT n.note_id, n.title, n.s3_key, n.extracted_from_note_id,
        (SELECT a.mime_type FROM app.attachments a
         WHERE a.note_id = n.note_id AND a.user_id = n.user_id AND a.s3_key = n.s3_key
         ORDER BY a.id LIMIT 1) AS mime_type
      FROM app.notes n
      WHERE n.user_id = ${userId}::uuid
        AND n.deleted_at IS NULL AND n.is_folder = FALSE AND n.is_import_cache_source = FALSE
        AND EXISTS (SELECT 1 FROM app.tree_items tree
          WHERE tree.note_id = n.note_id AND tree.user_id = n.user_id)
    ), relationships AS (
      SELECT links.source_note_id AS source_id, links.target_note_id AS target_id, 'embedded' AS relation
      FROM app.note_links links
      WHERE links.user_id = ${userId}::uuid AND links.source_note_id = ANY(${noteIds}::uuid[])
      UNION
      SELECT source.note_id, target.note_id, 'extraction'
      FROM active_notes source JOIN active_notes target ON
        target.extracted_from_note_id = source.note_id OR source.extracted_from_note_id = target.note_id
      WHERE source.note_id = ANY(${noteIds}::uuid[])
      UNION
      SELECT attachment.note_id, target.note_id, 'attachment'
      FROM app.attachments attachment JOIN active_notes target ON target.s3_key = attachment.s3_key
      WHERE attachment.user_id = ${userId}::uuid AND attachment.note_id = ANY(${noteIds}::uuid[])
    )
    SELECT relationship.source_id, target.note_id AS target_id, target.title,
      target.s3_key, target.mime_type, relationship.relation
    FROM relationships relationship
    JOIN active_notes source ON source.note_id = relationship.source_id
    JOIN active_notes target ON target.note_id = relationship.target_id
    WHERE source.note_id <> target.note_id
    ORDER BY relationship.source_id, target.note_id, relationship.relation
  `;
}

function referencesFor(noteId: string, rows: ReferenceRow[]): MaterialReference[] {
  const references = new Map<string, MaterialReference>();
  for (const row of rows) {
    if (row.source_id !== noteId) continue;
    if (references.get(row.target_id)?.kind === "embedded") continue;
    references.set(row.target_id, {
      id: row.target_id,
      title: row.title ?? "Untitled",
      kind: row.relation === "embedded" ? "embedded" : row.s3_key || isStudyBinary({ ...row, title: row.title ?? "" }) ? "file" : "note",
    });
  }
  return [...references.values()];
}

export async function getStudyMapSnapshot(userId: string, mapId: string): Promise<StudyMapSnapshot> {
  const [mapRow] = await readMaps(userId, mapId);
  if (!mapRow) throw new ApiError(404, "Study map not found");
  const map = await mapFromRow(userId, mapRow);
  const reviewedTopicIds = new Set(map.topics.filter((topic) => topic.reviewed).map((topic) => topic.id));
  const taxonomyEvidenceStale = topicsSchema.parse(mapRow.topics).some((topic) => topic.reviewed && !reviewedTopicIds.has(topic.id));
  if (map.materialCount > 500) {
    throw new ApiError(422, "This study map has more than 500 active materials. Remove materials or split them into smaller maps.");
  }
  const rows = await sql<MaterialRow[]>`
    SELECT material.note_id, material.map_id, material.kind, material.labels,
      material.associations, material.overrides, material.source_hash,
      material.taxonomy_version, material.status, material.updated_at, material.classified_at,
      material.classification #>> '{rawDecisions,0,anchor,noteId}' AS source_note_id,
      material.classification #>> '{rawDecisions,0,anchor,field}' AS source_field
    FROM app.study_materials material
    JOIN app.notes n ON n.note_id = material.note_id AND n.user_id = material.user_id
    WHERE material.map_id = ${mapId}::uuid AND material.user_id = ${userId}::uuid AND material.excluded = FALSE
      AND n.deleted_at IS NULL AND n.is_folder = FALSE AND n.is_import_cache_source = FALSE
      AND EXISTS (SELECT 1 FROM app.tree_items tree
        WHERE tree.note_id = n.note_id AND tree.user_id = n.user_id)
    ORDER BY n.title, n.note_id
    LIMIT 501
  `;
  if (rows.length > 500) {
    throw new ApiError(422, "This study map has more than 500 active materials. Remove materials or split them into smaller maps.");
  }
  const noteIds = rows.map((row) => row.note_id);
  const [notes, derivedNotes, references, paperRows, jobRows] = await Promise.all([
    readNotes(userId, noteIds),
    readDerivedNotes(userId, noteIds),
    readReferences(userId, noteIds),
    sql<PaperRow[]>`
      SELECT paper.note_id, paper.source_hash, paper.taxonomy_version, paper.reviewed, paper.structure
      FROM app.study_papers paper
      JOIN app.study_materials material ON material.map_id = paper.map_id
        AND material.user_id = paper.user_id AND material.note_id = paper.note_id AND material.excluded = FALSE
      JOIN app.notes n ON n.note_id = paper.note_id AND n.user_id = paper.user_id
      WHERE paper.map_id = ${mapId}::uuid AND paper.user_id = ${userId}::uuid
        AND n.deleted_at IS NULL AND n.is_folder = FALSE AND n.is_import_cache_source = FALSE
        AND EXISTS (SELECT 1 FROM app.tree_items tree
          WHERE tree.note_id = n.note_id AND tree.user_id = n.user_id)
      ORDER BY n.title, n.note_id
    `,
    sql<JobRow[]>`
      SELECT job.id, job.kind, job.note_id, job.state, job.error, job.created_at
      FROM app.study_jobs job
      WHERE job.map_id = ${mapId}::uuid AND job.user_id = ${userId}::uuid
        AND (job.note_id IS NULL OR EXISTS (
          SELECT 1 FROM app.notes n
          JOIN app.study_materials material ON material.note_id = n.note_id AND material.user_id = n.user_id
            AND material.map_id = job.map_id AND material.excluded = FALSE
          WHERE n.note_id = job.note_id AND n.user_id = job.user_id
            AND n.deleted_at IS NULL AND n.is_folder = FALSE AND n.is_import_cache_source = FALSE
            AND EXISTS (SELECT 1 FROM app.tree_items tree
              WHERE tree.note_id = n.note_id AND tree.user_id = n.user_id)))
      ORDER BY (job.state IN ('pending', 'running')) DESC, job.created_at DESC, job.id DESC LIMIT 120
    `,
  ]);
  const associations = new Map(rows.map((row) => [row.note_id, associationsSchema.parse(row.associations)]));
  const parsedPapers = paperRows.map((row) => ({ row, structure: examStructureSchema.parse(row.structure) }));
  const evidenceIds = [...new Set([
    ...[...associations.values()].flatMap((items) => items.flatMap((item) => item.evidence.map((evidence) => evidence.anchor.noteId))),
    ...parsedPapers.flatMap(({ structure }) => [
      ...structure.questions.map((question) => question.source.noteId),
      ...structure.sections.flatMap((section) => section.source ? [section.source.noteId] : []),
    ]),
  ])];
  const accessibleEvidence = await readNotes(userId, evidenceIds);
  const accessibleIds = new Set(accessibleEvidence.map((note) => note.note_id));
  const topicIds = new Set(map.topics.map((topic) => topic.id));
  const notesById = new Map(notes.map((note) => [note.note_id, note]));
  const documents = new Map(notes.map((note) => [note.note_id, documentFor(note, derivedNotes, false)]));
  const materials: StudyMaterial[] = rows.flatMap((row) => {
    const note = notesById.get(row.note_id);
    const source = documents.get(row.note_id);
    if (!note || !source) return [];
    const oversized = source.text.length > MAX_SOURCE_CHARS;
    const parsedOverrides = materialOverridesSchema.parse(row.overrides);
    const overrides = {
      ...parsedOverrides,
      topics: Object.fromEntries(Object.entries(parsedOverrides.topics).filter(([topicId]) => topicIds.has(topicId))),
    };
    const hasCorrections = overrides.kind !== undefined || overrides.labels !== undefined || Object.keys(overrides.topics).length > 0;
    const correctionsStale = hasCorrections && (overrides.sourceHash !== source.hash || overrides.taxonomyVersion !== map.taxonomyVersion || taxonomyEvidenceStale);
    const originalStatus = statusSchema.parse(row.status);
    const storedAssociations = associations.get(row.note_id) ?? [];
    const classificationStale = (Boolean(row.source_hash) || originalStatus === "classified") && (
      row.source_hash !== source.hash || row.taxonomy_version !== map.taxonomyVersion || taxonomyEvidenceStale
      || row.source_note_id !== source.noteId || row.source_field !== source.field
      || storedAssociations.some((association) => association.origin === "automatic"
        && !association.evidence.some((evidence) => isCurrentAnchor(evidence.anchor, source)))
    );
    return [{
      noteId: row.note_id,
      mapId: row.map_id,
      title: note.title ?? "Untitled",
      excerpt: sourceExcerpt(source),
      kind: overrides.kind ?? documentKindSchema.parse(row.kind),
      labels: overrides.labels ?? labelsSchema.parse(row.labels),
      associations: storedAssociations.filter((association) => topicIds.has(association.topicId)).map((association) => ({
        ...association,
        evidence: association.evidence.filter((evidence) => accessibleIds.has(evidence.anchor.noteId)),
      })),
      overrides,
      status: oversized ? "failed" : classificationStale || correctionsStale ? "stale" : originalStatus,
      taxonomyEvidenceStale,
      sourceHash: row.source_hash,
      currentHash: source.hash,
      taxonomyVersion: row.taxonomy_version,
      updatedAt: timestamp(row.updated_at),
      classifiedAt: row.classified_at ? timestamp(row.classified_at) : null,
      isFile: Boolean(note.s3_key) || isStudyBinary({ ...note, title: note.title ?? "" }),
      mimeType: note.mime_type,
      references: referencesFor(row.note_id, references),
    }];
  });
  const papers: StudyPaper[] = parsedPapers.flatMap(({ row, structure }) => {
    const note = notesById.get(row.note_id);
    const source = documents.get(row.note_id);
    if (!note || !source || structure.questions.some((question) => !accessibleIds.has(question.source.noteId))
      || structure.sections.some((section) => section.source && !accessibleIds.has(section.source.noteId))) return [];
    return [{
      noteId: row.note_id,
      title: note.title ?? "Untitled",
      sourceHash: row.source_hash,
      currentHash: source.hash,
      taxonomyVersion: row.taxonomy_version,
      reviewed: row.reviewed && row.source_hash === source.hash && row.taxonomy_version === map.taxonomyVersion && !taxonomyEvidenceStale
        && source.text.length <= MAX_SOURCE_CHARS
        && structure.questions.every((question) => isCurrentAnchor(question.source, source))
        && structure.sections.every((section) => section.source === null || isCurrentAnchor(section.source, source)),
      structure: {
        ...structure,
        questions: structure.questions.map((question) => ({ ...question, topicIds: question.topicIds.filter((id) => topicIds.has(id)) })),
      },
    }];
  });
  const jobs: StudyJob[] = jobRows.map((row) => ({
    id: row.id,
    kind: jobKindSchema.parse(row.kind),
    noteId: row.note_id,
    state: jobStateSchema.parse(row.state),
    error: row.error,
    createdAt: timestamp(row.created_at),
  }));
  const cardIds = new Set([
    ...map.topics.map((topic) => `topic:${topic.id}`),
    ...materials.map((material) => `note:${material.noteId}`),
  ]);
  return {
    map: {
      ...map,
      materialCount: materials.length,
      board: {
        ...map.board,
        ...(map.board.scene ? { scene: pruneAvailableRefs(map.board.scene, cardIds) } : {}),
        placements: map.board.placements.filter((placement) => cardIds.has(placement.id)),
        links: map.board.links.filter((link) => cardIds.has(link.source) && cardIds.has(link.target)),
      },
    },
    materials,
    papers,
    jobs,
    provider: studyProviderStatus(),
  };
}

export async function getNoteStudyMaps(userId: string, noteId: string): Promise<Array<{
  mapId: string;
  mapName: string;
  material: StudyMaterial;
  topics: StudyTopic[];
  taxonomyVersion: number;
}>> {
  const [note] = await readNotes(userId, [noteId]);
  if (!note) return [];
  const binary = isStudyBinary({ ...note, title: note.title ?? "" });
  const related = binary
    ? (await readDerivedNotes(userId, [noteId])).filter((candidate) => !isStudyBinary({ ...candidate, title: candidate.title ?? "" }))
    : note.extracted_from_note_id
      ? (await readNotes(userId, [note.extracted_from_note_id])).filter((candidate) => isStudyBinary({ ...candidate, title: candidate.title ?? "" }))
      : [];
  const candidateIds = [noteId, ...related.map((candidate) => candidate.note_id)];
  const rows = await sql<Array<{ map_id: string; note_id: string }>>`
    SELECT material.map_id, material.note_id FROM app.study_materials material
    JOIN app.study_maps map ON map.id = material.map_id AND map.user_id = material.user_id
    JOIN app.notes n ON n.note_id = material.note_id AND n.user_id = material.user_id
    JOIN app.notes requested ON requested.note_id = ${noteId}::uuid AND requested.user_id = material.user_id
    WHERE material.note_id = ANY(${candidateIds}::uuid[]) AND material.user_id = ${userId}::uuid AND material.excluded = FALSE
      AND n.deleted_at IS NULL AND n.is_folder = FALSE AND n.is_import_cache_source = FALSE
      AND EXISTS (SELECT 1 FROM app.tree_items tree
        WHERE tree.note_id = n.note_id AND tree.user_id = n.user_id)
      AND requested.deleted_at IS NULL AND requested.is_folder = FALSE AND requested.is_import_cache_source = FALSE
      AND EXISTS (SELECT 1 FROM app.tree_items tree
        WHERE tree.note_id = requested.note_id AND tree.user_id = requested.user_id)
      AND (n.note_id = requested.note_id OR n.extracted_from_note_id = requested.note_id
        OR requested.extracted_from_note_id = n.note_id)
    ORDER BY map.updated_at DESC, map.id, array_position(${candidateIds}::uuid[], material.note_id)
  `;
  const selectedMaterials = new Map<string, string>();
  for (const row of rows) {
    if (!selectedMaterials.has(row.map_id)) selectedMaterials.set(row.map_id, row.note_id);
  }
  const snapshots = await Promise.all([...selectedMaterials.keys()].map((mapId) => getStudyMapSnapshot(userId, mapId)));
  return snapshots.flatMap(({ map, materials }) => {
    const material = materials.find((item) => item.noteId === selectedMaterials.get(map.id));
    return material ? [{ mapId: map.id, mapName: map.name, material, topics: map.topics, taxonomyVersion: map.taxonomyVersion }] : [];
  });
}
