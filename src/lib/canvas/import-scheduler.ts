import sql from "../../database/pgsql.js";
import { enqueueCanvasJob } from "../queue.ts";

export type ImportServiceClass = "free" | "semester" | "academic_year";

export const IMPORT_CLASS_WEIGHTS: Record<ImportServiceClass, number> = {
  free: 1,
  semester: 3,
  academic_year: 5,
};

export function chooseWeightedClass(
  current: Partial<Record<ImportServiceClass, number>>,
  eligible: ImportServiceClass[],
): { chosen: ImportServiceClass; next: Record<ImportServiceClass, number> } | null {
  if (eligible.length === 0) return null;
  const next = {
    free: current.free ?? 0,
    semester: current.semester ?? 0,
    academic_year: current.academic_year ?? 0,
  };
  for (const serviceClass of eligible) {
    next[serviceClass] += IMPORT_CLASS_WEIGHTS[serviceClass];
  }
  const chosen = eligible.reduce((best, candidate) =>
    next[candidate] > next[best] ? candidate : best,
  );
  next[chosen] -= eligible.reduce(
    (sum, serviceClass) => sum + IMPORT_CLASS_WEIGHTS[serviceClass],
    0,
  );
  return { chosen, next };
}

interface DispatchRecord {
  id: string;
  job_id: string;
  user_id: string;
}

/**
 * Releases a bounded number of Canvas files into the provider queue. Classes
 * use smooth weighted round robin; users within a class use least-recently
 * served order. One in-flight file per user prevents a large import monopolising
 * worker slots. The advisory lock makes selection safe across worker replicas.
 */
export async function dispatchFairCanvasFiles(limit = 10): Promise<number> {
  const selected = await sql.begin(async (tx: any) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('oghma-import-fair-dispatch'))`;
    const records: DispatchRecord[] = [];

    for (let slot = 0; slot < Math.max(0, limit); slot += 1) {
      const eligibleRows = await tx`
        SELECT DISTINCT COALESCE(l.import_service_class, 'free') AS service_class
        FROM app.canvas_imports ci
        JOIN app.canvas_import_jobs cij ON cij.id = ci.job_id
        JOIN app.login l ON l.user_id = ci.user_id
        WHERE ci.status = 'pending'
          AND ci.dispatched_at IS NULL
          AND cij.status = 'processing'
          AND NOT EXISTS (
            SELECT 1 FROM app.canvas_imports active
            WHERE active.user_id = ci.user_id
              AND active.dispatched_at IS NOT NULL
              AND active.status IN ('pending', 'downloading', 'processing', 'indexing')
          )
      `;
      const eligible = eligibleRows.map((row: { service_class: ImportServiceClass }) => row.service_class);
      if (eligible.length === 0) break;

      const stateRows = await tx`
        SELECT service_class, current_weight FROM app.import_scheduler_classes
        FOR UPDATE
      `;
      const state = Object.fromEntries(
        stateRows.map((row: { service_class: ImportServiceClass; current_weight: number }) => [
          row.service_class,
          Number(row.current_weight),
        ]),
      );
      const decision = chooseWeightedClass(state, eligible);
      if (!decision) break;

      for (const serviceClass of Object.keys(decision.next) as ImportServiceClass[]) {
        await tx`
          UPDATE app.import_scheduler_classes
          SET current_weight = ${decision.next[serviceClass]}, updated_at = NOW()
          WHERE service_class = ${serviceClass}
        `;
      }

      const [record] = await tx`
        SELECT ci.id, ci.job_id, ci.user_id
        FROM app.canvas_imports ci
        JOIN app.canvas_import_jobs cij ON cij.id = ci.job_id
        JOIN app.login l ON l.user_id = ci.user_id
        LEFT JOIN app.import_scheduler_users isu ON isu.user_id = ci.user_id
        WHERE ci.status = 'pending'
          AND ci.dispatched_at IS NULL
          AND cij.status = 'processing'
          AND COALESCE(l.import_service_class, 'free') = ${decision.chosen}
          AND NOT EXISTS (
            SELECT 1 FROM app.canvas_imports active
            WHERE active.user_id = ci.user_id
              AND active.dispatched_at IS NOT NULL
              AND active.status IN ('pending', 'downloading', 'processing', 'indexing')
          )
        ORDER BY isu.last_dispatched_at ASC NULLS FIRST, ci.created_at ASC
        LIMIT 1
        FOR UPDATE OF ci SKIP LOCKED
      `;
      if (!record) continue;

      await tx`UPDATE app.canvas_imports SET dispatched_at = NOW() WHERE id = ${record.id}::uuid`;
      await tx`
        INSERT INTO app.import_scheduler_users (user_id, last_dispatched_at)
        VALUES (${record.user_id}::uuid, NOW())
        ON CONFLICT (user_id) DO UPDATE SET last_dispatched_at = EXCLUDED.last_dispatched_at
      `;
      records.push(record as DispatchRecord);
    }
    return records;
  });

  let enqueued = 0;
  for (const record of selected) {
    try {
      await enqueueCanvasJob("canvas-file", {
        importRecordId: record.id,
        jobId: record.job_id,
        userId: record.user_id,
      });
      enqueued += 1;
    } catch (error) {
      await sql`
        UPDATE app.canvas_imports SET dispatched_at = NULL
        WHERE id = ${record.id}::uuid AND status = 'pending'
      `;
      console.error(`Fair import dispatch failed for ${record.id}:`, error);
    }
  }
  return enqueued;
}
