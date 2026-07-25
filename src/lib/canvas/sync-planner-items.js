import sql from "../../database/pgsql.js";
import { normalizePlannerItem } from "./planner-items.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function defaultStartDate(now = new Date()) { return new Date(now.getTime() - 30 * DAY_MS).toISOString(); }
function defaultEndDate(now = new Date()) { return new Date(now.getTime() + 180 * DAY_MS).toISOString(); }

async function upsertPlannerItem(userId, item) {
  await sql`
    INSERT INTO app.canvas_planner_items (
      user_id, canvas_domain, canvas_user_id, canvas_course_id,
      canvas_context_type, canvas_context_id, context_name,
      plannable_type, plannable_id, canvas_planner_item_id,
      title, body, html_url, source, item_state,
      display_at, due_at, available_at, end_at, date_source, all_day,
      raw_planner_item, raw_plannable, last_seen_at, deleted_at
    ) VALUES (
      ${userId}::uuid, ${item.canvas_domain}, ${item.canvas_user_id}, ${item.canvas_course_id},
      ${item.canvas_context_type}, ${item.canvas_context_id}, ${item.context_name},
      ${item.plannable_type}, ${item.plannable_id}, ${item.canvas_planner_item_id},
      ${item.title}, ${item.body}, ${item.html_url}, ${item.source}, ${item.item_state},
      ${item.display_at}, ${item.due_at}, ${item.available_at}, ${item.end_at}, ${item.date_source}, ${item.all_day},
      ${JSON.stringify(item.raw_planner_item)}::jsonb, ${item.raw_plannable ? JSON.stringify(item.raw_plannable) : null}::jsonb,
      NOW(), NULL
    )
    ON CONFLICT (user_id, canvas_domain, plannable_type, plannable_id)
    DO UPDATE SET
      canvas_user_id = EXCLUDED.canvas_user_id,
      canvas_course_id = EXCLUDED.canvas_course_id,
      canvas_context_type = EXCLUDED.canvas_context_type,
      canvas_context_id = EXCLUDED.canvas_context_id,
      context_name = EXCLUDED.context_name,
      canvas_planner_item_id = EXCLUDED.canvas_planner_item_id,
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      html_url = EXCLUDED.html_url,
      source = EXCLUDED.source,
      item_state = EXCLUDED.item_state,
      display_at = EXCLUDED.display_at,
      due_at = EXCLUDED.due_at,
      available_at = EXCLUDED.available_at,
      end_at = EXCLUDED.end_at,
      date_source = EXCLUDED.date_source,
      all_day = EXCLUDED.all_day,
      raw_planner_item = EXCLUDED.raw_planner_item,
      raw_plannable = EXCLUDED.raw_plannable,
      last_seen_at = NOW(),
      deleted_at = NULL,
      updated_at = NOW()
  `;
}

async function tombstoneMissingRows({ userId, canvasDomain, startDate, endDate, seenKeys }) {
  const stableKeys = seenKeys.map((key) => `${key.type}:${key.id}`);
  const rows = await sql`
    UPDATE app.canvas_planner_items
    SET deleted_at = NOW(), item_state = 'deleted', updated_at = NOW()
    WHERE user_id = ${userId}::uuid
      AND canvas_domain = ${canvasDomain}
      AND deleted_at IS NULL
      AND display_at >= ${startDate}::timestamptz
      AND display_at <= ${endDate}::timestamptz
      AND NOT ((plannable_type || ':' || plannable_id) = ANY(${stableKeys}::text[]))
    RETURNING id
  `;
  return rows.length;
}

/**
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.canvasDomain
 * @param {number|null} [params.canvasUserId]
 * @param {{ getPlannerItems(startDate: string, endDate: string): Promise<{ data?: any[], forbidden?: boolean, error?: string }> }} params.client
 * @param {string} [params.startDate]
 * @param {string} [params.endDate]
 * @param {Date} [params.now]
 * @returns {Promise<{ synced: number, tombstoned: number, errors: number, partial: boolean }>}
 */
export async function syncCanvasPlannerItems({ userId, canvasDomain, canvasUserId = null, client, startDate, endDate, now = new Date() } = {}) {
  if (!userId) throw new Error("userId is required");
  if (!canvasDomain) throw new Error("canvasDomain is required");
  if (!client?.getPlannerItems) throw new Error("client.getPlannerItems is required");
  const effectiveStart = startDate ?? defaultStartDate(now);
  const effectiveEnd = endDate ?? defaultEndDate(now);
  const result = await client.getPlannerItems(effectiveStart, effectiveEnd);
  if (result?.error || result?.forbidden || !Array.isArray(result?.data)) {
    console.warn(`[sync-planner-items] partial planner sync for ${canvasDomain}: ${result?.error ?? "forbidden"}`);
    return { synced: 0, tombstoned: 0, errors: 1, partial: true };
  }
  let synced = 0;
  let errors = 0;
  const seenKeys = [];
  for (const rawItem of result.data) {
    try {
      const item = normalizePlannerItem(rawItem, { canvasDomain, canvasUserId });
      await upsertPlannerItem(userId, item);
      seenKeys.push({ type: item.plannable_type, id: item.plannable_id });
      synced++;
    } catch (err) {
      console.error(`[sync-planner-items] failed to upsert planner item: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }
  if (errors > 0) return { synced, tombstoned: 0, errors, partial: true };
  const tombstoned = await tombstoneMissingRows({ userId, canvasDomain, startDate: effectiveStart, endDate: effectiveEnd, seenKeys });
  return { synced, tombstoned, errors: 0, partial: false };
}
