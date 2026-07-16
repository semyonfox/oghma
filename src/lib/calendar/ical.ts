const encoder = new TextEncoder();

export function escapeIcal(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
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

export function formatIcalDate(date: Date): string {
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
  status?: "CONFIRMED" | "COMPLETED" | "CANCELLED";
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
