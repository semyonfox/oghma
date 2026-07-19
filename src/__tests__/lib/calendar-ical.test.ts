import { describe, expect, it } from "vitest";
import {
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
    expect(escapeIcal("one, two; three\\four\nfive\r")).toBe(
      "one\\, two\\; three\\\\four\\nfive",
    );
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
