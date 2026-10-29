import { NextResponse } from "next/server";
import sql from "@/database/pgsql";
import { ApiError, requireAuth, requireValidId, withErrorHandler } from "@/lib/api-error";
import type { ClassificationProgress } from "@/lib/study-map/eta";
import { MAX_TAGS_VIEW_ROOTS } from "@/lib/notes/tags-view";

interface CountsRow {
  total: number;
  classified: number;
  failed: number;
  waiting_for_text: number;
  active_jobs: number;
  auto_classify: boolean;
  run_started_at: Date | string | null;
}

const MAX_COMPLETIONS = 20;

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

/**
 * GET /api/study-maps/progress?map=<id>&map=<id>
 *
 * Counts behind the Tags view dial: how many files are sorted into topics,
 * how many wait for text, and when this run's recent files finished.
 */
export const GET = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const rawIds = new URL(request.url).searchParams.getAll("map");
  if (rawIds.length === 0) throw new ApiError(400, "Choose a study map");
  if (rawIds.length > MAX_TAGS_VIEW_ROOTS) throw new ApiError(400, "Too many study maps");
  const mapIds = [...new Set(rawIds.map((id) => requireValidId(id, "study map ID")))];

  const [counts] = await sql<CountsRow[]>`
    WITH active AS (
      SELECT material.status, n.note_id, n.user_id, n.s3_key, n.content, n.extracted_text
      FROM app.study_materials material
      JOIN app.notes n ON n.note_id = material.note_id AND n.user_id = material.user_id
      WHERE material.user_id = ${user.user_id}::uuid AND material.map_id = ANY(${mapIds}::uuid[])
        AND NOT material.excluded
        AND n.deleted_at IS NULL AND NOT n.is_folder AND NOT n.is_import_cache_source
        AND EXISTS (SELECT 1 FROM app.tree_items tree
          WHERE tree.note_id = n.note_id AND tree.user_id = n.user_id)
    )
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'classified')::int AS classified,
      count(*) FILTER (WHERE status = 'failed')::int AS failed,
      count(*) FILTER (WHERE status IN ('unclassified', 'stale')
        AND s3_key IS NOT NULL
        AND COALESCE(extracted_text, '') = '' AND COALESCE(content, '') = ''
        AND NOT EXISTS (SELECT 1 FROM app.notes derived
          WHERE derived.user_id = active.user_id AND derived.extracted_from_note_id = active.note_id
            AND derived.deleted_at IS NULL AND COALESCE(derived.content, '') <> ''))::int AS waiting_for_text,
      (SELECT count(*)::int FROM app.study_jobs job
       WHERE job.user_id = ${user.user_id}::uuid AND job.map_id = ANY(${mapIds}::uuid[])
         AND job.kind = 'classify' AND job.state IN ('pending', 'running')) AS active_jobs,
      (SELECT min(job.created_at) FROM app.study_jobs job
       WHERE job.user_id = ${user.user_id}::uuid AND job.map_id = ANY(${mapIds}::uuid[])
         AND job.kind = 'classify' AND job.state IN ('pending', 'running')) AS run_started_at,
      EXISTS (SELECT 1 FROM app.study_maps map
        WHERE map.user_id = ${user.user_id}::uuid AND map.id = ANY(${mapIds}::uuid[])
          AND map.auto_classify) AS auto_classify
    FROM active
  `;
  if (!counts) throw new ApiError(404, "Study map not found");

  // only this run's completions say anything about its pace
  const completions = counts.run_started_at
    ? await sql<Array<{ classified_at: Date | string }>>`
        SELECT material.classified_at
        FROM app.study_materials material
        WHERE material.user_id = ${user.user_id}::uuid AND material.map_id = ANY(${mapIds}::uuid[])
          AND material.status = 'classified'
          AND material.classified_at >= ${iso(counts.run_started_at)}::timestamptz
        ORDER BY material.classified_at DESC
        LIMIT ${MAX_COMPLETIONS}
      `
    : [];

  const body: ClassificationProgress = {
    total: counts.total,
    classified: counts.classified,
    failed: counts.failed,
    waitingForText: counts.waiting_for_text,
    activeJobs: counts.active_jobs,
    autoClassify: counts.auto_classify,
    runStartedAt: counts.run_started_at ? iso(counts.run_started_at) : null,
    completions: completions.map((row) => iso(row.classified_at)),
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
});
