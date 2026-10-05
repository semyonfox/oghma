import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { z } from "zod";
import sql from "@/database/pgsql";
import { ApiError } from "@/lib/api-errors";
import { classifyStudySource } from "./classification";
import { studyProviderStatus } from "./config";
import { isCurrentAnchor } from "./evidence";
import { extractStudyPaper, proposeStudyTopics } from "./generation";
import { chooseSyllabus } from "./syllabus";
import { decisionCache, generationCache } from "./cache";
import {
  buildCourseOutline,
  fetchModuleDescriptor,
  moduleCode,
} from "./descriptor";
import { CanvasClient } from "@/lib/canvas/client";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import { insertNoteWithTree } from "@/lib/notes/storage/create-note";
import { invalidateTreeAfterPublish } from "@/lib/notes/tree-cache";
import {
  lockStudyMap,
  lockStudySource,
  requireStudyMaterial,
  syncStudyMaterials,
  validateStudyAnchors,
  validateStudyTopics,
} from "./mutations";
import {
  classificationSchema,
  examStructureSchema,
  jobCreateSchema,
  sourceAnchorSchema,
  topicSchema,
  type ClassificationResult,
  type ExamStructure,
  type SourceDocument,
  type StudyJobKind,
  type StudyTopic,
} from "./types";

type Transaction = postgres.TransactionSql;

interface ClaimedJob {
  id: string;
  user_id: string;
  map_id: string;
  note_id: string | null;
  kind: StudyJobKind;
  lease_token: string;
}

interface JobInput {
  source: SourceDocument;
  /** topic proposals read the syllabus in full plus the opening of each other material */
  sources: SourceDocument[];
  syllabusNoteId: string | null;
  topics: StudyTopic[];
  version: number;
  taxonomyVersion: number;
  academicYear: string;
  noteId: string;
}

const messages = {
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

class StudyJobError extends Error {}

function requireProvider(kind: StudyJobKind): void {
  try {
    const provider = studyProviderStatus();
    if (kind === "classify" ? provider.ready : provider.generationReady) return;
  } catch {
    /* configuration errors must not expose environment values */
  }
  throw new ApiError(400, messages.configuration);
}

function requireTopics(topics: StudyTopic[], kind: StudyJobKind): void {
  if (kind !== "taxonomy" && !topics.some((topic) => topic.reviewed)) {
    throw new ApiError(400, messages.topics);
  }
}

async function requireCurrentTopicSources(
  tx: Transaction,
  userId: string,
  topics: StudyTopic[],
  kind: StudyJobKind,
): Promise<void> {
  if (kind === "taxonomy") return;
  try {
    await validateStudyAnchors(
      tx,
      userId,
      topics
        .filter((topic) => topic.reviewed)
        .flatMap((topic) => topic.sources),
    );
  } catch {
    throw new ApiError(409, messages.topicSources);
  }
}

async function readSource(
  tx: Transaction,
  userId: string,
  noteId: string,
): Promise<SourceDocument> {
  try {
    return await lockStudySource(tx, userId, noteId);
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404)
      throw new StudyJobError(messages.source);
    if (error instanceof ApiError && error.statusCode === 422)
      throw new StudyJobError(messages.size);
    if (
      error instanceof Error &&
      error.message.endsWith(
        "exceeds the 320,000-character study map limit. Split this material into smaller notes or files and try again.",
      )
    ) {
      throw new StudyJobError(messages.size);
    }
    throw error;
  }
}

export async function enqueueStudyJobs(
  userId: string,
  mapId: string,
  input: z.infer<typeof jobCreateSchema>,
  options: { automatic?: boolean } = {},
): Promise<number> {
  const request = jobCreateSchema.parse(input);
  return sql.begin(async (tx) => {
    const map = await lockStudyMap(tx, userId, mapId);
    if (options.automatic && !map.auto_classify) return 0;
    requireProvider(request.kind);
    requireTopics(topicSchema.array().max(80).parse(map.topics), request.kind);
    await requireCurrentTopicSources(
      tx,
      userId,
      topicSchema.array().parse(map.topics),
      request.kind,
    );
    if (request.kind === "taxonomy" && request.noteId !== null) {
      throw new ApiError(
        400,
        "Topic proposals use the map's selected syllabus note.",
      );
    }
    // without a syllabus, topics come from the materials themselves
    const [firstMaterial] =
      request.kind === "taxonomy" && !map.syllabus_note_id
        ? await tx<{ note_id: string }[]>`
          SELECT material.note_id FROM app.study_materials material
          JOIN app.notes n ON n.note_id = material.note_id AND n.user_id = material.user_id
          WHERE material.user_id = ${userId}::uuid AND material.map_id = ${mapId}::uuid AND NOT material.excluded
            AND n.deleted_at IS NULL AND NOT n.is_folder AND NOT n.is_import_cache_source
          ORDER BY n.created_at, n.note_id LIMIT 1
        `
        : [];
    if (
      request.kind === "taxonomy" &&
      !map.syllabus_note_id &&
      !firstMaterial
    ) {
      throw new ApiError(
        400,
        "Add notes to this module before finding topics.",
      );
    }
    const [active] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count FROM app.study_jobs
      WHERE user_id = ${userId}::uuid AND state IN ('pending', 'running')
    `;
    if (active.count >= 100) {
      if (options.automatic) return 0;
      throw new ApiError(
        400,
        "You already have 100 queued study jobs. Wait for them to finish before adding more.",
      );
    }
    const explicitNote =
      request.kind === "taxonomy"
        ? (map.syllabus_note_id ?? firstMaterial?.note_id ?? null)
        : request.noteId;
    const candidates = explicitNote
      ? [{ note_id: explicitNote, needed: true }]
      : await tx<Array<{ note_id: string; needed: boolean }>>`
      SELECT material.note_id,
        CASE WHEN ${request.kind} = 'paper' THEN
          paper.note_id IS NULL OR paper.taxonomy_version <> ${map.taxonomy_version}
        ELSE material.status IN ('unclassified', 'stale') OR material.taxonomy_version <> ${map.taxonomy_version}
        END AS needed
      FROM app.study_materials material
      JOIN app.notes n ON n.note_id = material.note_id AND n.user_id = material.user_id
      LEFT JOIN app.study_papers paper ON paper.map_id = material.map_id AND paper.note_id = material.note_id
      WHERE material.user_id = ${userId}::uuid AND material.map_id = ${mapId}::uuid AND NOT material.excluded
        AND n.deleted_at IS NULL AND NOT n.is_folder AND NOT n.is_import_cache_source
        AND EXISTS (SELECT 1 FROM app.tree_items t WHERE t.note_id = n.note_id AND t.user_id = n.user_id)
        AND (${request.kind} <> 'paper' OR COALESCE(material.overrides->>'kind', material.kind) = 'past_paper')
      ORDER BY material.updated_at, material.note_id LIMIT 500
    `;
    let inserted = 0;
    for (const candidate of candidates) {
      if (inserted >= Math.min(50, 100 - active.count)) break;
      if (options.automatic) {
        const [latest] = await tx<{ state: string }[]>`
          SELECT state FROM app.study_jobs WHERE user_id = ${userId}::uuid AND map_id = ${mapId}::uuid
            AND kind = ${request.kind} AND note_id IS NOT DISTINCT FROM ${request.kind === "taxonomy" ? null : candidate.note_id}::uuid
          ORDER BY created_at DESC, id DESC LIMIT 1
        `;
        if (latest?.state === "failed") continue;
      }
      await requireStudyMaterial(tx, userId, mapId, candidate.note_id);
      let source: SourceDocument;
      try {
        source = await readSource(tx, userId, candidate.note_id);
      } catch (error) {
        if (!(error instanceof StudyJobError)) throw error;
        if (explicitNote) throw new ApiError(400, error.message);
        continue;
      }
      if (!source.text.trim()) {
        if (explicitNote) throw new ApiError(400, messages.text);
        continue;
      }
      if (!explicitNote && !candidate.needed) {
        const [previous] =
          request.kind === "paper"
            ? await tx<
                {
                  source_hash: string;
                  source_note_id: string | null;
                  source_field: string | null;
                }[]
              >`
          SELECT source_hash, structure #>> '{questions,0,source,noteId}' AS source_note_id,
            structure #>> '{questions,0,source,field}' AS source_field
          FROM app.study_papers WHERE map_id = ${mapId}::uuid AND note_id = ${candidate.note_id}::uuid
        `
            : await tx<
                {
                  source_hash: string;
                  source_note_id: string | null;
                  source_field: string | null;
                }[]
              >`
          SELECT source_hash, classification #>> '{rawDecisions,0,anchor,noteId}' AS source_note_id,
            classification #>> '{rawDecisions,0,anchor,field}' AS source_field
          FROM app.study_materials WHERE map_id = ${mapId}::uuid AND note_id = ${candidate.note_id}::uuid
        `;
        if (
          previous?.source_hash === source.hash &&
          previous.source_note_id === source.noteId &&
          previous.source_field === source.field
        )
          continue;
      }
      const rows = await tx<{ id: string }[]>`
        INSERT INTO app.study_jobs (user_id, map_id, note_id, kind)
        VALUES (${userId}::uuid, ${mapId}::uuid, ${request.kind === "taxonomy" ? null : candidate.note_id}::uuid, ${request.kind})
        ON CONFLICT DO NOTHING RETURNING id
      `;
      inserted += rows.length;
    }
    return inserted;
  });
}

async function claimJob(): Promise<ClaimedJob | undefined> {
  return sql.begin(async (tx) => {
    await tx`
      WITH expired AS (
        SELECT id FROM app.study_jobs WHERE state = 'running' AND lease_until <= clock_timestamp()
        ORDER BY lease_until, id LIMIT 50 FOR UPDATE SKIP LOCKED
      )
      UPDATE app.study_jobs job SET state = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
        error = CASE WHEN attempts >= 3 THEN ${messages.expired} ELSE NULL END,
        lease_until = NULL, lease_token = NULL, updated_at = NOW()
      FROM expired WHERE job.id = expired.id
    `;
    const [job] = await tx<ClaimedJob[]>`
      WITH next AS (
        SELECT id FROM app.study_jobs WHERE state = 'pending' AND attempts < 3
        ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      UPDATE app.study_jobs job SET state = 'running', attempts = attempts + 1,
        lease_token = ${randomUUID()}::uuid, lease_until = clock_timestamp() + INTERVAL '5 minutes', error = NULL, updated_at = NOW()
      FROM next WHERE job.id = next.id
      RETURNING job.id, job.user_id, job.map_id, job.note_id, job.kind, job.lease_token
    `;
    return job;
  });
}

async function readJobInput(job: ClaimedJob): Promise<JobInput> {
  return sql.begin(async (tx) => {
    const map = await lockStudyMap(tx, job.user_id, job.map_id);
    const topics = topicSchema.array().max(80).parse(map.topics);
    requireProvider(job.kind);
    requireTopics(topics, job.kind);
    await requireCurrentTopicSources(tx, job.user_id, topics, job.kind);
    if (job.kind === "taxonomy") {
      const rows = await tx<{ note_id: string }[]>`
        SELECT material.note_id FROM app.study_materials material
        JOIN app.notes n ON n.note_id = material.note_id AND n.user_id = material.user_id
        WHERE material.user_id = ${job.user_id}::uuid AND material.map_id = ${job.map_id}::uuid AND NOT material.excluded
          AND n.deleted_at IS NULL AND NOT n.is_folder AND NOT n.is_import_cache_source
          AND COALESCE(material.overrides->>'kind', material.kind) <> 'past_paper'
          AND EXISTS (SELECT 1 FROM app.tree_items t WHERE t.note_id = n.note_id AND t.user_id = n.user_id)
        ORDER BY (n.note_id = ${map.syllabus_note_id}::uuid) DESC NULLS LAST, n.created_at, n.note_id
        LIMIT ${MAX_TAXONOMY_SOURCES}
      `;
      const sources: SourceDocument[] = [];
      for (const row of rows) {
        try {
          const source = await readSource(tx, job.user_id, row.note_id);
          if (source.text.trim()) sources.push(source);
        } catch (error) {
          // an unreadable or oversized material is left out of the proposal, not fatal
          if (!(error instanceof StudyJobError)) throw error;
        }
      }
      if (!sources.length) throw new StudyJobError(messages.text);
      return {
        source: sources[0],
        sources,
        syllabusNoteId: map.syllabus_note_id,
        topics,
        noteId: sources[0].noteId,
        version: map.version,
        taxonomyVersion: map.taxonomy_version,
        academicYear: map.academic_year,
      };
    }
    const noteId = job.note_id;
    if (!noteId) throw new StudyJobError(messages.source);
    try {
      await requireStudyMaterial(tx, job.user_id, job.map_id, noteId);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404)
        throw new StudyJobError(messages.material);
      throw error;
    }
    const source = await readSource(tx, job.user_id, noteId);
    if (!source.text.trim()) throw new StudyJobError(messages.text);
    return {
      source,
      sources: [source],
      syllabusNoteId: map.syllabus_note_id,
      topics,
      noteId,
      version: map.version,
      taxonomyVersion: map.taxonomy_version,
      academicYear: map.academic_year,
    };
  });
}

function validateClassification(
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

function validatePaper(
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

function taxonomyMeaning(topics: StudyTopic[]): string {
  return JSON.stringify(
    topics
      .map(({ id, definition, includes, excludes, aliases, reviewed }) => ({
        id,
        definition,
        includes,
        excludes,
        aliases: [...aliases].sort(),
        reviewed,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  );
}

async function currentSource(
  tx: Transaction,
  job: ClaimedJob,
  input: JobInput,
): Promise<SourceDocument> {
  try {
    await requireStudyMaterial(tx, job.user_id, job.map_id, input.noteId);
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404)
      throw new StudyJobError(messages.material);
    throw error;
  }
  const source = await readSource(tx, job.user_id, input.noteId);
  if (
    source.hash !== input.source.hash ||
    source.noteId !== input.source.noteId ||
    source.field !== input.source.field
  )
    throw new StudyJobError(messages.changed);
  return source;
}

async function publishJob(
  job: ClaimedJob,
  input: JobInput,
  result: ClassificationResult | ExamStructure | StudyTopic[],
  signal: AbortSignal,
): Promise<void> {
  await sql.begin(async (tx) => {
    signal.throwIfAborted();
    const map = await lockStudyMap(tx, job.user_id, job.map_id);
    if (
      map.version !== input.version ||
      map.taxonomy_version !== input.taxonomyVersion ||
      (job.kind === "taxonomy" && map.syllabus_note_id !== input.syllabusNoteId)
    )
      throw new StudyJobError(messages.mapChanged);
    await requireCurrentTopicSources(
      tx,
      job.user_id,
      topicSchema.array().parse(map.topics),
      job.kind,
    );
    // a proposal reads many sources; its quotes are rechecked against current text below instead
    const source =
      job.kind === "taxonomy"
        ? input.source
        : await currentSource(tx, job, input);
    const [lease] = await tx<{ id: string }[]>`
      SELECT id FROM app.study_jobs WHERE id = ${job.id}::uuid AND state = 'running'
        AND lease_token = ${job.lease_token}::uuid AND lease_until > clock_timestamp() FOR UPDATE
    `;
    if (!lease) throw new StudyJobError(messages.lease);
    signal.throwIfAborted();
    if (job.kind === "taxonomy") {
      const topics = topicSchema.array().max(80).parse(result);
      validateStudyTopics(topics);
      await validateStudyAnchors(
        tx,
        job.user_id,
        topics.flatMap((topic) => topic.sources),
      );
      const changed = taxonomyMeaning(input.topics) !== taxonomyMeaning(topics);
      await tx`
        UPDATE app.study_maps SET topics = ${JSON.stringify(topics)}::text::jsonb,
          taxonomy_version = taxonomy_version + ${changed ? 1 : 0}, version = version + 1, updated_at = NOW()
        WHERE id = ${job.map_id}::uuid AND user_id = ${job.user_id}::uuid
      `;
      if (changed)
        await tx`UPDATE app.study_materials SET status = 'stale'
        WHERE user_id = ${job.user_id}::uuid AND map_id = ${job.map_id}::uuid AND status <> 'unclassified'`;
    } else if (job.kind === "classify") {
      const classification = validateClassification(
        classificationSchema.parse(result),
        source,
        input.topics,
      );
      await tx`
        UPDATE app.study_materials SET kind = ${classification.kind}, labels = ${classification.labels}::text[],
          associations = ${JSON.stringify(classification.associations)}::text::jsonb, classification = ${JSON.stringify(classification)}::text::jsonb,
          source_hash = ${source.hash}, taxonomy_version = ${map.taxonomy_version}, status = 'classified', classified_at = NOW(), updated_at = NOW()
        WHERE map_id = ${job.map_id}::uuid AND user_id = ${job.user_id}::uuid AND note_id = ${input.noteId}::uuid
      `;
    } else {
      const structure = validatePaper(
        examStructureSchema.parse(result),
        source,
        input.topics,
      );
      await tx`
        INSERT INTO app.study_papers (map_id, user_id, note_id, source_hash, taxonomy_version, reviewed, structure)
        VALUES (${job.map_id}::uuid, ${job.user_id}::uuid, ${input.noteId}::uuid, ${source.hash}, ${map.taxonomy_version}, FALSE, ${JSON.stringify(structure)}::text::jsonb)
        ON CONFLICT (map_id, note_id) DO UPDATE SET source_hash = EXCLUDED.source_hash,
          taxonomy_version = EXCLUDED.taxonomy_version, reviewed = FALSE, structure = EXCLUDED.structure, updated_at = NOW()
      `;
    }
    signal.throwIfAborted();
    const completed = await tx<{ id: string }[]>`
      UPDATE app.study_jobs SET state = 'completed', error = NULL, lease_until = NULL, lease_token = NULL, updated_at = NOW()
      WHERE id = ${job.id}::uuid AND state = 'running' AND lease_token = ${job.lease_token}::uuid
        AND lease_until > clock_timestamp() RETURNING id
    `;
    if (!completed.length) throw new StudyJobError(messages.lease);
  });
}

const MAX_TAXONOMY_SOURCES = 60;
const TAXONOMY_BUDGET_CHARS = 80_000;
const MIN_PREVIEW_CHARS = 600;
const RICH_SYLLABUS_CHARS = 1_500;

/** fits every material's opening into one generation call; the syllabus, when chosen, stays whole */
function taxonomyPreview(input: JobInput): {
  sources: SourceDocument[];
  previewChars: number;
  fullSources: number;
} {
  const fullSources = input.syllabusNoteId ? 1 : 0;
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

let processing = false;

export async function processNextStudyJob(): Promise<boolean> {
  if (processing) return false;
  processing = true;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let renewing: Promise<void> | undefined;
  try {
    const job = await claimJob();
    if (!job) return false;
    const controller = new AbortController();
    heartbeat = setInterval(() => {
      if (renewing || controller.signal.aborted) return;
      renewing = (async () => {
        try {
          const renewed = await sql<{ id: string }[]>`
            UPDATE app.study_jobs SET lease_until = clock_timestamp() + INTERVAL '5 minutes', updated_at = NOW()
            WHERE id = ${job.id}::uuid AND state = 'running' AND lease_token = ${job.lease_token}::uuid
              AND lease_until > clock_timestamp() RETURNING id
          `;
          if (!renewed.length) controller.abort();
        } catch {
          controller.abort();
        }
      })().finally(() => {
        renewing = undefined;
      });
    }, 30_000);
    heartbeat.unref();
    try {
      const input = await readJobInput(job);
      controller.signal.throwIfAborted();
      const result =
        job.kind === "taxonomy"
          ? await (async () => {
              const { sources, ...preview } = taxonomyPreview(input);
              return proposeStudyTopics(
                sources,
                input.topics,
                controller.signal,
                {
                  ...preview,
                  cache: generationCache,
                },
              );
            })()
          : job.kind === "classify"
            ? await classifyStudySource(
                input.source,
                input.topics,
                controller.signal,
                decisionCache,
              )
            : await extractStudyPaper(
                input.source,
                input.topics,
                input.academicYear,
                controller.signal,
              );
      await publishJob(job, input, result, controller.signal);
      if (job.kind === "taxonomy")
        await classifyAutomatically(job.user_id, job.map_id);
    } catch (error) {
      const safeMessage = controller.signal.aborted
        ? messages.lease
        : error instanceof StudyJobError
          ? error.message
          : error instanceof ApiError &&
              (error.userMessage === messages.configuration ||
                error.userMessage === messages.topics ||
                error.userMessage === messages.topicSources)
            ? error.userMessage
            : error instanceof ApiError && error.statusCode === 404
              ? messages.map
              : error instanceof z.ZodError
                ? messages.invalid
                : messages.provider;
      await sql`
        UPDATE app.study_jobs SET state = 'failed', error = ${safeMessage}, lease_until = NULL, lease_token = NULL, updated_at = NOW()
        WHERE id = ${job.id}::uuid AND state = 'running' AND lease_token = ${job.lease_token}::uuid
          AND lease_until > clock_timestamp()
      `;
    }
    return true;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (renewing) await renewing;
    processing = false;
  }
}

async function classifyAutomatically(userId: string, mapId: string) {
  try {
    await enqueueStudyJobs(
      userId,
      mapId,
      { kind: "classify", noteId: null },
      { automatic: true },
    );
  } catch (error) {
    // an unconfigured provider or stale topic source leaves the map for manual review
    if (!(error instanceof ApiError)) throw error;
  }
}

/**
 * a course outline from free sources, gathered before any lock is held: the public module
 * descriptor for Galway courses, the Canvas syllabus and home page, and the imported module folders
 */
async function outlineFor(
  userId: string,
  mapId: string,
): Promise<{ title: string; body: string } | null> {
  const [row] = await sql<
    Array<{
      root: string;
      title: string;
      course: string;
      domain: string | null;
    }>
  >`
    SELECT folder.note_id AS root, folder.title, map.canvas_course_id AS course, login.canvas_domain AS domain
    FROM app.study_maps map
    JOIN app.login login ON login.user_id = map.user_id
    JOIN app.notes folder ON folder.note_id = map.root_note_id AND folder.user_id = map.user_id
    WHERE map.id = ${mapId}::uuid AND map.user_id = ${userId}::uuid
      AND map.auto_classify AND map.syllabus_note_id IS NULL AND map.canvas_course_id IS NOT NULL
  `;
  if (!row) return null;
  const code = moduleCode(row.title);
  const modules = await sql<{ title: string }[]>`
    SELECT n.title FROM app.notes n JOIN app.tree_items t ON t.note_id = n.note_id AND t.user_id = n.user_id
    WHERE n.user_id = ${userId}::uuid AND t.parent_id = ${row.root}::uuid AND n.is_folder
      AND n.deleted_at IS NULL AND n.canvas_module_id IS NOT NULL
    ORDER BY n.created_at, n.note_id
  `;
  const [descriptor, canvas] = await Promise.all([
    // module codes are only meaningful against the university that issued them
    code && /galway/i.test(row.domain ?? "")
      ? fetchModuleDescriptor(code)
      : null,
    (async () => {
      const credentials = await loadCanvasCredentials(userId).catch(() => null);
      if (!credentials) return null;
      return new CanvasClient(credentials.domain, credentials.token)
        .getCourseOutline(row.course)
        .catch(() => null);
    })(),
  ]);
  const title = code ?? row.title;
  const body = buildCourseOutline({
    title,
    descriptor,
    syllabus: canvas?.syllabus ?? null,
    frontPage: canvas?.frontPage ?? null,
    modules: modules.map((module) => module.title),
  });
  return body ? { title: `${title} course outline`, body } : null;
}

/**
 * brings an opted-in map up to date without user input: pulls in its sources, adds the
 * public module descriptor or picks a syllabus, proposes topics once from all of its
 * material, then classifies new or changed material
 */
export async function autoConfigureStudyMap(
  userId: string,
  mapId: string,
): Promise<void> {
  await syncStudyMaterials(userId, mapId);
  const outline = await outlineFor(userId, mapId);
  let createdIn: string | null = null;
  const map = await sql.begin(async (tx) => {
    const map = await lockStudyMap(tx, userId, mapId);
    if (!map.auto_classify || map.syllabus_note_id) return map;
    let syllabusId: string | null = null;
    if (outline && map.root_note_id) {
      const title = outline.title;
      const [existing] = await tx<{ note_id: string }[]>`
        SELECT n.note_id FROM app.notes n
        JOIN app.tree_items t ON t.note_id = n.note_id AND t.user_id = n.user_id
        WHERE n.user_id = ${userId}::uuid AND t.parent_id = ${map.root_note_id}::uuid
          AND n.title = ${title} AND n.deleted_at IS NULL AND NOT n.is_folder
        LIMIT 1
      `;
      syllabusId =
        existing?.note_id ??
        (
          await insertNoteWithTree(tx, {
            noteId: randomUUID(),
            userId,
            title,
            content: outline.body,
            isFolder: false,
            parentId: map.root_note_id,
          })
        ).noteId;
      if (!existing) createdIn = map.root_note_id;
      // an outline the student removed from the map stays removed
      await tx`
        INSERT INTO app.study_materials (map_id, user_id, note_id)
        VALUES (${mapId}::uuid, ${userId}::uuid, ${syllabusId}::uuid) ON CONFLICT (map_id, note_id) DO NOTHING
      `;
    } else {
      const candidates = await tx<Array<{ noteId: string; title: string }>>`
        SELECT n.note_id AS "noteId", n.title FROM app.study_materials material
        JOIN app.notes n ON n.note_id = material.note_id AND n.user_id = material.user_id
        WHERE material.user_id = ${userId}::uuid AND material.map_id = ${mapId}::uuid AND NOT material.excluded
          AND n.deleted_at IS NULL AND NOT n.is_folder AND NOT n.is_import_cache_source
        ORDER BY n.created_at, n.note_id
      `;
      syllabusId = chooseSyllabus(candidates)?.noteId ?? null;
    }
    if (!syllabusId) return map;
    await tx`
      UPDATE app.study_maps SET syllabus_note_id = ${syllabusId}::uuid, version = version + 1, updated_at = NOW()
      WHERE id = ${mapId}::uuid AND user_id = ${userId}::uuid
    `;
    return { ...map, syllabus_note_id: syllabusId };
  });
  if (createdIn) await invalidateTreeAfterPublish(userId, createdIn);
  if (!map.auto_classify) return;
  if (topicSchema.array().parse(map.topics).length > 0) {
    await classifyAutomatically(userId, mapId);
    return;
  }
  // propose once per map, after imports settle, so the topics see the whole course;
  // an empty or rejected proposal must not rerun a paid call every minute
  const [blocked] = await sql<{ reason: string }[]>`
    SELECT 'proposed' AS reason FROM app.study_jobs
    WHERE user_id = ${userId}::uuid AND map_id = ${mapId}::uuid AND kind = 'taxonomy'
    UNION ALL
    SELECT 'importing' FROM app.canvas_import_jobs
    WHERE user_id = ${userId}::uuid AND status IN ('queued', 'discovering', 'processing')
    LIMIT 1
  `;
  if (blocked) return;
  try {
    await enqueueStudyJobs(
      userId,
      mapId,
      { kind: "taxonomy", noteId: null },
      { automatic: true },
    );
  } catch (error) {
    // no generation provider or no readable material yet: the map still shows its weeks
    if (!(error instanceof ApiError)) throw error;
  }
}

let reconciliationCursor = "00000000-0000-0000-0000-000000000000";
let reconciling = false;

export async function reconcileStudyMaps(): Promise<void> {
  if (reconciling) return;
  reconciling = true;
  try {
    const maps = await sql<Array<{ id: string; user_id: string }>>`
      SELECT id, user_id FROM app.study_maps WHERE auto_classify AND id > ${reconciliationCursor}::uuid
      ORDER BY id LIMIT 50
    `;
    reconciliationCursor =
      maps.length === 50
        ? maps[maps.length - 1].id
        : "00000000-0000-0000-0000-000000000000";
    for (const map of maps) {
      try {
        await autoConfigureStudyMap(map.user_id, map.id);
      } catch (error) {
        // deleted maps and oversized roots do not stop other maps
        if (!(error instanceof ApiError)) throw error;
      }
    }
  } finally {
    reconciling = false;
  }
}
