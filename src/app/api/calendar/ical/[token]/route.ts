import { NextRequest, NextResponse } from "next/server";
import sql from "@/database/pgsql.js";

// ── iCal helpers ─────────────────────────────────────────────────────────────

function escapeIcal(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

// fold lines at 75 octets per RFC 5545
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let offset = 0;
  let first = true;
  while (offset < bytes.length) {
    const limit = first ? 75 : 74; // continuation lines start with a space
    parts.push(
      new TextDecoder().decode(bytes.slice(offset, offset + limit)),
    );
    offset += limit;
    first = false;
  }
  return parts.join("\r\n ");
}

function formatDt(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

interface VeventProps {
  uid: string;
  summary: string;
  dtstart: Date;
  dtend: Date;
  description?: string | null;
  categories?: string | null;
  status?: "CONFIRMED" | "COMPLETED" | "CANCELLED";
}

function buildVevent(props: VeventProps): string {
  const dtstamp = formatDt(new Date());
  const lines = [
    "BEGIN:VEVENT",
    foldLine(`UID:${props.uid}`),
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${formatDt(props.dtstart)}`,
    `DTEND:${formatDt(props.dtend)}`,
    foldLine(`SUMMARY:${escapeIcal(props.summary)}`),
  ];

  if (props.description) {
    lines.push(foldLine(`DESCRIPTION:${escapeIcal(props.description)}`));
  }
  if (props.categories) {
    lines.push(foldLine(`CATEGORIES:${escapeIcal(props.categories)}`));
  }
  if (props.status) {
    lines.push(`STATUS:${props.status}`);
  }

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // validate token — UUID format only to avoid injection
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const [loginRow] = await sql`
    SELECT user_id FROM app.login
    WHERE calendar_export_token = ${token}::uuid
  `;

  if (!loginRow) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const userId = loginRow.user_id;

  // fetch assignments with a due date
  const assignments = await sql`
    SELECT id, title, description, course_name, due_at, status
    FROM app.assignments
    WHERE user_id = ${userId}::uuid
      AND due_at IS NOT NULL
    ORDER BY due_at ASC
  `;

  // fetch time blocks (last 30 days to future), with linked assignment title
  const timeBlocks = await sql`
    SELECT tb.id, tb.title, tb.starts_at, tb.ends_at, tb.completed,
           a.title AS assignment_title, a.course_name
    FROM app.time_blocks tb
    LEFT JOIN app.assignments a ON tb.assignment_id = a.id
    WHERE tb.user_id = ${userId}::uuid
      AND tb.starts_at >= NOW() - INTERVAL '30 days'
    ORDER BY tb.starts_at ASC
  `;

  // build VEVENT strings
  const vevents: string[] = [];

  for (const a of assignments) {
    const dtstart = new Date(a.due_at);
    const dtend = new Date(dtstart.getTime() + 60 * 60 * 1000); // +1 hour
    const summary = a.course_name
      ? `[${a.course_name}] ${a.title}`
      : a.title;
    const description = [
      a.description,
      a.status === "done" ? "Status: Done" : null,
      a.status === "late" ? "Status: Late" : null,
    ]
      .filter(Boolean)
      .join("\n") || null;

    vevents.push(
      buildVevent({
        uid: `assignment-${a.id}@oghmanotes`,
        summary,
        dtstart,
        dtend,
        description,
        categories: a.course_name ?? null,
        status: a.status === "done" ? "COMPLETED" : "CONFIRMED",
      }),
    );
  }

  for (const tb of timeBlocks) {
    const blockTitle =
      tb.title ||
      (tb.assignment_title
        ? `Study: ${tb.assignment_title}`
        : "Study Block");
    const summary = tb.course_name
      ? `[${tb.course_name}] ${blockTitle}`
      : blockTitle;

    vevents.push(
      buildVevent({
        uid: `timeblock-${tb.id}@oghmanotes`,
        summary,
        dtstart: new Date(tb.starts_at),
        dtend: new Date(tb.ends_at),
        categories: tb.course_name ?? null,
        status: tb.completed ? "COMPLETED" : "CONFIRMED",
      }),
    );
  }

  const ical = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OghmaNotes//Calendar Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:OghmaNotes",
    "X-WR-CALDESC:Assignments and study blocks from OghmaNotes",
    ...vevents,
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ical, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="oghmanotes.ics"',
      // allow calendar apps to cache for up to 1 hour
      "Cache-Control": "private, max-age=3600",
    },
  });
}
