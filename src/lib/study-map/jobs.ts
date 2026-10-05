import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { z } from "zod";
import sql from "@/database/pgsql";
import { ApiError } from "@/lib/api-errors";
import { classifyStudySource } from "./classification";
import { studyProviderStatus } from "./config";
import { isCurrentAnchor } from "./evidence";
import { extractStudyPaper, proposeStudyTopics } from "./generation";
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
    if (request.kind === "taxonomy" && !map.syllabus_note_id) {
      throw new ApiError(
        400,
        "Select a syllabus note before proposing topics.",
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
      request.kind === "taxonomy" ? map.syllabus_note_id : request.noteId;
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
    const noteId = job.kind === "taxonomy" ? map.syllabus_note_id : job.note_id;
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
      (job.kind === "taxonomy" && map.syllabus_note_id !== input.noteId)
    )
      throw new StudyJobError(messages.mapChanged);
    await requireCurrentTopicSources(
      tx,
      job.user_id,
      topicSchema.array().parse(map.topics),
      job.kind,
    );
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
          ? await proposeStudyTopics(
              [input.source],
              input.topics,
              controller.signal,
            )
          : job.kind === "classify"
            ? await classifyStudySource(
                input.source,
                input.topics,
                controller.signal,
              )
            : await extractStudyPaper(
                input.source,
                input.topics,
                input.academicYear,
                controller.signal,
              );
      await publishJob(job, input, result, controller.signal);
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
        await syncStudyMaterials(map.user_id, map.id);
        await enqueueStudyJobs(
          map.user_id,
          map.id,
          { kind: "classify", noteId: null },
          { automatic: true },
        );
      } catch (error) {
        // unavailable providers, deleted maps and oversized roots do not stop other maps
        if (!(error instanceof ApiError)) throw error;
      }
    }
  } finally {
    reconciling = false;
  }
}
