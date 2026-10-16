import { stripHtmlToText } from "@/lib/canvas/content-formatting";

const encoder = new TextEncoder();

// keeps one feed response bounded even for a long Canvas description
const MAX_DESCRIPTION_CHARS = 2000;

export function escapeIcal(value: string): string {
  return (
    value
      // CR, LF and CRLF are all one line break in TEXT values
      .replace(/\r\n?/g, "\n")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n")
      // RFC 5545 TEXT forbids control characters other than HTAB
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
  );
}

export function foldIcalLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = "";
  let limit = 75;

  for (const codePoint of line) {
    const candidate = `${current}${codePoint}`;
    if (current && encoder.encode(candidate).length > limit) {
      parts.push(current);
      current = codePoint;
      limit = 74;
    } else {
      current = candidate;
    }
  }

  if (current) parts.push(current);
  return parts.join("\r\n ");
}

function formatIcalDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

interface IcalEventProps {
  uid: string;
  summary: string;
  dtstart: Date;
  dtend: Date;
  description?: string | null;
  categories?: string | null;
  // VEVENT only allows these three; COMPLETED is a VTODO status
  status?: "TENTATIVE" | "CONFIRMED" | "CANCELLED";
  dtstamp?: Date;
}

export function buildIcalEvent(props: IcalEventProps): string {
  const lines = [
    "BEGIN:VEVENT",
    foldIcalLine(`UID:${props.uid}`),
    `DTSTAMP:${formatIcalDate(props.dtstamp ?? new Date())}`,
    `DTSTART:${formatIcalDate(props.dtstart)}`,
    `DTEND:${formatIcalDate(props.dtend)}`,
    foldIcalLine(`SUMMARY:${escapeIcal(props.summary)}`),
  ];

  if (props.description) {
    lines.push(foldIcalLine(`DESCRIPTION:${escapeIcal(props.description)}`));
  }
  if (props.categories) {
    lines.push(foldIcalLine(`CATEGORIES:${escapeIcal(props.categories)}`));
  }
  if (props.status) {
    lines.push(`STATUS:${props.status}`);
  }

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

export interface FeedAssignment {
  id: string;
  title: string;
  description: string | null;
  course_name: string | null;
  due_at: Date | string;
  status: string;
}

export interface FeedTimeBlock {
  id: string;
  title: string | null;
  starts_at: Date | string;
  ends_at: Date | string;
  completed: boolean;
  assignment_title: string | null;
  course_name: string | null;
}

function withCourse(title: string, courseName: string | null): string {
  return courseName ? `[${courseName}] ${title}` : title;
}

function feedDescription(html: string | null): string | null {
  const text = stripHtmlToText(html);
  if (!text) return null;
  return text.length > MAX_DESCRIPTION_CHARS
    ? `${text.slice(0, MAX_DESCRIPTION_CHARS)}…`
    : text;
}

export function assignmentToIcalEvent(
  assignment: FeedAssignment,
  dtstamp?: Date,
): string {
  const dtstart = new Date(assignment.due_at);
  const statusLine =
    assignment.status === "done"
      ? "Status: Done"
      : assignment.status === "late"
        ? "Status: Late"
        : null;
  const description =
    [feedDescription(assignment.description), statusLine]
      .filter(Boolean)
      .join("\n") || null;

  return buildIcalEvent({
    uid: `assignment-${assignment.id}@oghmanotes`,
    summary: withCourse(assignment.title, assignment.course_name),
    dtstart,
    dtend: new Date(dtstart.getTime() + 60 * 60 * 1000),
    description,
    categories: assignment.course_name,
    status: "CONFIRMED",
    dtstamp,
  });
}

export function timeBlockToIcalEvent(
  block: FeedTimeBlock,
  dtstamp?: Date,
): string {
  const title =
    block.title ||
    (block.assignment_title ? `Study: ${block.assignment_title}` : "Study Block");

  return buildIcalEvent({
    uid: `timeblock-${block.id}@oghmanotes`,
    summary: withCourse(title, block.course_name),
    dtstart: new Date(block.starts_at),
    dtend: new Date(block.ends_at),
    description: block.completed ? "Status: Done" : null,
    categories: block.course_name,
    status: "CONFIRMED",
    dtstamp,
  });
}

export function buildIcalCalendar(events: readonly string[]): string {
  // every content line ends in CRLF, including END:VCALENDAR
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OghmaNotes//Calendar Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:OghmaNotes",
    "X-WR-CALDESC:Assignments and study blocks from OghmaNotes",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
