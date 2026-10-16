import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withErrorHandler, tracedError } from "@/lib/api-error";
import { resolveTimeZone } from "@/lib/quiz/time-zone";
import sql from "@/database/pgsql";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
// a calendar view spans at most a few weeks; this bounds the scan
const MAX_RANGE_DAYS = 400;

interface ReviewDateRow {
  review_date: string;
}

function parseDateKey(value: string | null): number | null {
  if (!value || !DATE_KEY_RE.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value
    ? null
    : time;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await requireAuth();

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const startTime = parseDateKey(start);
  const endTime = parseDateKey(end);

  if (!start || !end || startTime === null || endTime === null) {
    return tracedError("start and end must be YYYY-MM-DD dates", 400);
  }
  if (endTime < startTime || endTime - startTime > MAX_RANGE_DAYS * 86_400_000) {
    return tracedError(`date range must be 0 to ${MAX_RANGE_DAYS} days`, 400);
  }

  // dates are bucketed in the student's zone and returned as plain YYYY-MM-DD
  // strings; a bare DATE column would come back as a UTC Date and serialise
  // with a time part the calendar's day keys never match
  const timeZone = resolveTimeZone(searchParams.get("tz"));
  const rows = await sql<ReviewDateRow[]>`
    SELECT DISTINCT to_char(created_at AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS review_date
    FROM app.quiz_reviews
    WHERE user_id = ${user.user_id}::uuid
      AND created_at >= (${start}::date - interval '1 day')
      AND created_at < (${end}::date + interval '2 days')
    ORDER BY review_date
  `;

  return NextResponse.json({
    dates: rows
      .map((r) => r.review_date)
      .filter((date) => date >= start && date <= end),
  });
});
