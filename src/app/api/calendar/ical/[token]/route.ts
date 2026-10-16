import { NextResponse } from "next/server";
import sql from "@/database/pgsql";
import { withErrorHandler, type RouteParamsContext } from "@/lib/api-error";
import { isValidUUID } from "@/lib/utils/uuid";
import {
  assignmentToIcalEvent,
  buildIcalCalendar,
  timeBlockToIcalEvent,
  type FeedAssignment,
  type FeedTimeBlock,
} from "@/lib/calendar/ical";

// the feed date window is still an open product call, so the feed keeps
// every dated assignment and blocks from the last 30 days onwards
function notFound() {
  return new NextResponse("Not Found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * GET /api/calendar/ical/:token
 * Public iCal feed. The unguessable token is the only credential, so an unknown,
 * rotated or revoked token and an inactive account all look the same.
 */
export const GET = withErrorHandler(async (
  _request,
  { params }: RouteParamsContext<{ token: string }>,
) => {
  const { token } = await params;
  if (!isValidUUID(token)) return notFound();

  const [loginRow] = await sql<{ user_id: string }[]>`
    SELECT user_id FROM app.login
    WHERE calendar_export_token = ${token}::uuid
      AND is_active = true AND deleted_at IS NULL
  `;
  if (!loginRow) return notFound();

  const userId = loginRow.user_id;

  const assignments = await sql<FeedAssignment[]>`
    SELECT id, title, description, course_name, due_at, status
    FROM app.assignments
    WHERE user_id = ${userId}::uuid
      AND due_at IS NOT NULL
    ORDER BY due_at ASC
  `;

  const timeBlocks = await sql<FeedTimeBlock[]>`
    SELECT tb.id, tb.title, tb.starts_at, tb.ends_at, tb.completed,
           a.title AS assignment_title, a.course_name
    FROM app.time_blocks tb
    LEFT JOIN app.assignments a
      ON a.id = tb.assignment_id AND a.user_id = tb.user_id
    WHERE tb.user_id = ${userId}::uuid
      AND tb.starts_at >= NOW() - INTERVAL '30 days'
    ORDER BY tb.starts_at ASC
  `;

  const dtstamp = new Date();
  const ical = buildIcalCalendar([
    ...assignments.map((assignment) => assignmentToIcalEvent(assignment, dtstamp)),
    ...timeBlocks.map((block) => timeBlockToIcalEvent(block, dtstamp)),
  ]);

  return new NextResponse(ical, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="oghmanotes.ics"',
      // the URL is a bearer credential for private data, so no shared caches
      "Cache-Control": "private, no-store",
    },
  });
});
