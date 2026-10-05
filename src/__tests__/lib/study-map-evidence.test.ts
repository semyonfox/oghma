import { describe, expect, it } from "vitest";
import {
  anchorFromQuote,
  isCurrentAnchor,
  sourceDocument,
  splitSourcePassages,
} from "@/lib/study-map/evidence";
import type { SourceDocument } from "@/lib/study-map/types";

const noteId = "11111111-1111-4111-8111-111111111111";

function source(text: string, isFile = false): SourceDocument {
  return sourceDocument({
    noteId,
    title: "Lecture",
    content: text,
    extractedText: text,
    isFile,
  });
}

function anchor(source: SourceDocument, quote: string, occurrence = 0) {
  const result = anchorFromQuote(source, quote, occurrence);
  if (!result) throw new Error(`Missing test quote: ${quote}`);
  return result;
}

describe("study map source evidence", () => {
  it("selects editable content for notes and extracted text for files", () => {
    const input = {
      noteId,
      title: "Lecture",
      content: "Edited notes",
      extractedText: "Original PDF",
    };
    expect(sourceDocument(input)).toMatchObject({
      field: "content",
      text: "Edited notes",
    });
    expect(sourceDocument({ ...input, isFile: true })).toMatchObject({
      field: "extracted_text",
      text: "Original PDF",
    });
  });

  it("keeps a missing selected field empty rather than quoting another field", () => {
    const note = sourceDocument({
      noteId,
      title: "Empty note",
      content: null,
      extractedText: "PDF text",
    });
    const file = sourceDocument({
      noteId,
      title: "Empty file",
      content: "Notes",
      extractedText: null,
      isFile: true,
    });
    expect(note.text).toBe("");
    expect(file.text).toBe("");
    expect(splitSourcePassages(note)).toEqual([]);
    expect(anchorFromQuote(file, "Notes")).toBeNull();
  });

  it("records exact UTF-16 offsets and source lines without normalizing CRLF or emoji", () => {
    const document = source("🧠 first\r\n\r\n  αβ\r\nlast");
    const evidence = anchor(document, "αβ\r\nlast");
    expect(evidence).toMatchObject({
      noteId,
      field: "content",
      start: 14,
      end: 22,
      line: 3,
      page: null,
      quote: "αβ\r\nlast",
    });
    expect(document.text.slice(evidence.start, evidence.end)).toBe(
      evidence.quote,
    );
    expect(isCurrentAnchor(evidence, document)).toBe(true);
  });

  it("keeps repeated passages tied to separate source occurrences", () => {
    const document = source("repeat\n\nrepeat\n\nrepeat");
    const passages = splitSourcePassages(document);
    expect(passages.map((passage) => passage.anchor.start)).toEqual([0, 8, 16]);
    expect(new Set(passages.map((passage) => passage.id)).size).toBe(3);
    expect(anchor(document, "repeat", 1)).toMatchObject({
      start: 8,
      end: 14,
      line: 3,
    });
    expect(anchor(document, "repeat", 2)).toMatchObject({
      start: 16,
      end: 22,
      line: 5,
    });
    expect(anchorFromQuote(document, "repeat", 3)).toBeNull();
  });

  it("finds overlapping quote occurrences without substituting the first match", () => {
    const document = source("ababa");
    expect(anchor(document, "aba", 1)).toMatchObject({ start: 2, end: 5 });
  });

  it("splits paragraphs and headings while preserving each passage's real location", () => {
    const document = source(
      "  Intro\r\ncontinues  \r\n\r\n# Topic\r\nBody\r\n\r\n  End  ",
    );
    const passages = splitSourcePassages(document);
    expect(passages.map((passage) => passage.text)).toEqual([
      "Intro\r\ncontinues",
      "# Topic\r\nBody",
      "End",
    ]);
    expect(passages.map((passage) => passage.anchor.line)).toEqual([1, 4, 7]);
    for (const passage of passages) {
      expect(
        document.text.slice(passage.anchor.start, passage.anchor.end),
      ).toBe(passage.text);
      expect(isCurrentAnchor(passage.anchor, document)).toBe(true);
    }
  });

  it("merges short neighbouring blocks into exact, longer passages when asked", () => {
    const slides = source("Slide one.\n\nSlide two.\n\nSlide three.");
    expect(splitSourcePassages(slides)).toHaveLength(3);
    const merged = splitSourcePassages(slides, 1_600, 1_200);
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe(slides.text);
    expect(isCurrentAnchor(merged[0].anchor, slides)).toBe(true);
    // merging never grows a passage past the maximum
    expect(splitSourcePassages(slides, 24, 1_200).map((p) => p.text)).toEqual([
      "Slide one.\n\nSlide two.",
      "Slide three.",
    ]);
  });

  it("splits long blocks without losing whitespace or changing offsets", () => {
    const text = "one two three four five six seven eight nine ten ".repeat(8);
    const document = source(text);
    const passages = splitSourcePassages(document, 30);
    expect(passages.length).toBeGreaterThan(1);
    expect(passages.map((passage) => passage.text).join("")).toBe(
      text.trimEnd(),
    );
    let nextStart = 0;
    for (const passage of passages) {
      expect(passage.anchor.start).toBe(nextStart);
      expect(passage.text.length).toBeLessThanOrEqual(30);
      expect(
        document.text.slice(passage.anchor.start, passage.anchor.end),
      ).toBe(passage.text);
      expect(isCurrentAnchor(passage.anchor, document)).toBe(true);
      nextStart = passage.anchor.end;
    }
  });

  it("keeps emoji intact when a long block boundary would bisect a surrogate pair", () => {
    const document = source("ab😀cd😀ef");
    const passages = splitSourcePassages(document, 3);
    expect(passages.map((passage) => passage.text).join("")).toBe(
      document.text,
    );
    for (const passage of passages) {
      expect(passage.text.isWellFormed()).toBe(true);
      expect(isCurrentAnchor(passage.anchor, document)).toBe(true);
    }
  });

  it("preserves a surrogate pair across the default passage boundary", () => {
    const document = source(`${"a".repeat(1_599)}😀tail`);
    const passages = splitSourcePassages(document);
    expect(passages).toHaveLength(2);
    expect(passages[0].anchor.end).toBe(1_599);
    expect(passages[1].anchor.start).toBe(1_599);
    expect(passages[1].text).toBe("😀tail");
    expect(passages.map((passage) => passage.text).join("")).toBe(
      document.text,
    );
    for (const passage of passages) {
      expect(passage.text.isWellFormed()).toBe(true);
      expect(isCurrentAnchor(passage.anchor, document)).toBe(true);
    }
  });

  it("preserves complete emoji and exact offsets at the minimum passage size", () => {
    const document = source("a😀b😀");
    const passages = splitSourcePassages(document, 2);
    expect(passages.map((passage) => passage.text)).toEqual([
      "a",
      "😀",
      "b",
      "😀",
    ]);
    expect(
      passages.map((passage) => [passage.anchor.start, passage.anchor.end]),
    ).toEqual([
      [0, 1],
      [1, 3],
      [3, 4],
      [4, 6],
    ]);
    expect(passages.map((passage) => passage.text).join("")).toBe(
      document.text,
    );
    for (const passage of passages) {
      expect(passage.text.isWellFormed()).toBe(true);
      expect(isCurrentAnchor(passage.anchor, document)).toBe(true);
    }
  });

  it("marks evidence stale when the document changes even if the quote still exists", () => {
    const original = source("First\nTarget quote");
    const evidence = anchor(original, "Target quote");
    expect(
      isCurrentAnchor(evidence, source("First\nTarget quote\nAdded text")),
    ).toBe(false);
    expect(
      isCurrentAnchor(evidence, source("New first line\nTarget quote")),
    ).toBe(false);
  });

  it("marks evidence stale when identical text moves to another source field", () => {
    const original = source("Same text");
    const extracted = source("Same text", true);
    expect(extracted.hash).not.toBe(original.hash);
    expect(isCurrentAnchor(anchor(original, "Same text"), extracted)).toBe(
      false,
    );
  });

  it("rejects anchors with another owner note, altered coordinates, quote, or location", () => {
    const document = source("First\nTarget");
    const evidence = anchor(document, "Target");
    expect(
      isCurrentAnchor(
        { ...evidence, noteId: "22222222-2222-4222-8222-222222222222" },
        document,
      ),
    ).toBe(false);
    expect(
      isCurrentAnchor({ ...evidence, start: evidence.start + 1 }, document),
    ).toBe(false);
    expect(
      isCurrentAnchor({ ...evidence, end: document.text.length + 1 }, document),
    ).toBe(false);
    expect(isCurrentAnchor({ ...evidence, start: 0.5 }, document)).toBe(false);
    expect(isCurrentAnchor({ ...evidence, quote: "Invented" }, document)).toBe(
      false,
    );
    expect(isCurrentAnchor({ ...evidence, line: 1 }, document)).toBe(false);
    expect(isCurrentAnchor({ ...evidence, page: 7 }, document)).toBe(false);
  });

  it.each(["[Page 7]", "--- Page 7 ---", "=== page 7 ===", "Page 7 of 12"])(
    "uses the explicit marker %s for following source evidence",
    (marker) => {
      const document = source(`Before\r\n${marker}\r\nQuoted material`);
      expect(anchor(document, "Before").page).toBeNull();
      expect(anchor(document, "Quoted material")).toMatchObject({
        line: 3,
        page: 7,
      });
      for (const passage of splitSourcePassages(document)) {
        expect(isCurrentAnchor(passage.anchor, document)).toBe(true);
      }
    },
  );

  it("changes pages only after a later explicit marker", () => {
    const document = source("[Page 2]\nFirst\n\nStill first\n[Page 4]\nSecond");
    expect(anchor(document, "First").page).toBe(2);
    expect(anchor(document, "Still first").page).toBe(2);
    expect(anchor(document, "Second").page).toBe(4);
  });

  it("does not invent pages from casual references or malformed markers", () => {
    const document = source(
      "Read page 7 for the answer.\n[Page 0]\nPage 9007199254740992\nAnswer",
    );
    expect(anchor(document, "Answer").page).toBeNull();
    expect(anchor(document, "page 7").page).toBeNull();
  });

  it.each(["", "Missing", "target ", "TARGET"])(
    "returns null for the absent or empty quote %j",
    (quote) => {
      expect(anchorFromQuote(source("target"), quote)).toBeNull();
    },
  );

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid occurrence %s",
    (occurrence) => {
      expect(
        anchorFromQuote(source("target"), "target", occurrence),
      ).toBeNull();
    },
  );

  it("rejects quotes longer than the evidence limit", () => {
    const document = source("a".repeat(8_001));
    expect(anchorFromQuote(document, document.text)).toBeNull();
    expect(anchorFromQuote(document, "a".repeat(8_000))).not.toBeNull();
  });

  it("rejects oversized source documents before building evidence", () => {
    expect(() => source("a".repeat(320_001))).toThrow(/320,000-character/);
    expect(() => source("😀".repeat(160_001), true)).toThrow(
      /320,000-character/,
    );
    expect(() =>
      splitSourcePassages({ ...source("Small"), text: "a".repeat(320_001) }),
    ).toThrow(/320,000-character/);
  });

  it("rejects documents that exceed the passage limit instead of silently dropping evidence", () => {
    const document = source("Paragraph\n\n".repeat(251));
    expect(() => splitSourcePassages(document)).toThrow(/250-passage/);
  });

  it.each([0, 1, -1, 1.5, 8_001, Number.POSITIVE_INFINITY])(
    "rejects unsupported passage size %s",
    (size) => {
      expect(() => splitSourcePassages(source("😀Text"), size)).toThrow(
        /between 2 and 8,000/,
      );
    },
  );
});
