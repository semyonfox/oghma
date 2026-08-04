import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

function validateDateParam(value: string | null, name: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `${name} must be a valid ISO date`);
  }
  return value;
}

function sanitizePlannerRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    source: row.source,
    plannable_type: row.plannable_type,
    plannable_id: row.plannable_id,
    canvas_course_id:
      row.canvas_course_id == null ? null : String(row.canvas_course_id),
    course_name: row.course_name,
    title: row.title,
    body: row.body,
    html_url: row.html_url,
    display_at: row.display_at,
    due_at: row.due_at,
    date_source: row.date_source,
    item_state: row.item_state,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await requireAuth();
  const url = new URL(request.url);
  const start = validateDateParam(url.searchParams.get("start"), "start");
  const end = validateDateParam(url.searchParams.get("end"), "end");
  const includeUndated = url.searchParams.get("includeUndated") === "1";
  const includeDeleted = url.searchParams.get("includeDeleted") === "1";
  const conditions = [sql`cpi.user_id = ${user.user_id}::uuid`];
  if (!includeDeleted) conditions.push(sql`cpi.deleted_at IS NULL`);
  if (start && end) {
    conditions.push(sql`(
      cpi.display_at BETWEEN ${start}::timestamptz AND ${end}::timestamptz
      ${includeUndated ? sql`OR cpi.display_at IS NULL` : sql``}
    )`);
  } else if (!includeUndated) {
    conditions.push(sql`cpi.display_at IS NOT NULL`);
  }
  const where = conditions.reduce((a, c) => sql`${a} AND ${c}`);
  const rows = await sql`
    SELECT cpi.id, cpi.source, cpi.plannable_type, cpi.plannable_id,
           cpi.canvas_course_id, cpi.context_name AS course_name,
           cpi.title, cpi.body, cpi.html_url,
           cpi.display_at, cpi.due_at, cpi.date_source, cpi.item_state,
           cpi.created_at, cpi.updated_at
    FROM app.canvas_planner_items cpi
    WHERE ${where}
    ORDER BY cpi.display_at ASC NULLS LAST, cpi.created_at DESC
  `;
  return NextResponse.json(rows.map(sanitizePlannerRow));
});
