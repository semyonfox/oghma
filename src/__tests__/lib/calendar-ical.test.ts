import { describe, expect, it } from "vitest";
import {
  assignmentToIcalEvent,
  buildIcalCalendar,
  buildIcalEvent,
  escapeIcal,
  foldIcalLine,
} from "@/lib/calendar/ical";

const encoder = new TextEncoder();

function unfold(value: string): string {
  return value.replace(/\r\n /g, "");
}

describe("foldIcalLine", () => {
  it("keeps every physical line within the UTF-8 octet limit", () => {
    const folded = foldIcalLine(`SUMMARY:${"é漢🙂".repeat(30)}`);
    for (const line of folded.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("round-trips multibyte characters at fold boundaries", () => {
    const original = `DESCRIPTION:${"a".repeat(66)}🙂 café 漢字`;
    const folded = foldIcalLine(original);

    expect(unfold(folded)).toBe(original);
    expect(folded).not.toContain("�");
  });
});

describe("iCal event helpers", () => {
  it("escapes reserved text characters", () => {
    expect(escapeIcal("one, two; three\\four\nfive")).toBe(
      "one\\, two\\; three\\\\four\\nfive",
    );
  });

  it("treats CRLF and lone CR as one line break and drops control characters", () => {
    expect(escapeIcal("a\r\nb\rc\u0000d\u001be\tf")).toBe("a\\nb\\ncde\tf");
  });

  it("builds deterministic Unicode-safe events", () => {
    const event = buildIcalEvent({
      uid: "unicode@example.test",
      summary: `Résumé ${"🙂".repeat(20)}`,
      description: "Café; 漢字",
      dtstart: new Date("2026-07-16T10:00:00.000Z"),
      dtend: new Date("2026-07-16T11:00:00.000Z"),
      dtstamp: new Date("2026-07-16T09:00:00.000Z"),
    });

    expect(unfold(event)).toContain(`SUMMARY:Résumé ${"🙂".repeat(20)}`);
    expect(unfold(event)).toContain("DESCRIPTION:Café\\; 漢字");
    expect(event).not.toContain("�");
  });
});

describe("iCal feed assembly", () => {
  it("terminates every content line with CRLF", () => {
    const calendar = buildIcalCalendar([]);
    expect(calendar.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(calendar.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("turns a Canvas HTML description into bounded plain text", () => {
    const event = unfold(assignmentToIcalEvent({
      id: "a1",
      title: "Essay",
      description: `<p>${"x".repeat(5000)}</p>`,
      course_name: null,
      due_at: "2026-10-10T22:59:00Z",
      status: "upcoming",
    }));

    const description = /DESCRIPTION:(.*)/.exec(event)?.[1] ?? "";
    expect(description).not.toContain("<p>");
    expect(description.length).toBeLessThanOrEqual(2001);
    expect(event).toContain("STATUS:CONFIRMED");
  });
});
