import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError } from "@/lib/api-errors";
import { sourceDocument } from "@/lib/study-map/evidence";
import {
  StudyJobError,
  failureMessage,
  mapChangedSince,
  messages,
  taxonomyPreview,
  type JobInput,
} from "@/lib/study-map/job-policy";

const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

function material(index: number, length: number) {
  return sourceDocument({
    noteId: ids[index],
    title: `Material ${index}`,
    content: "x".repeat(length),
    extractedText: null,
  });
}

function input(overrides: Partial<JobInput> = {}): JobInput {
  const source = material(0, 100);
  return {
    source,
    sources: [source],
    syllabusNoteId: null,
    syllabusIncluded: false,
    topics: [],
    version: 4,
    taxonomyVersion: 2,
    academicYear: "2025/26",
    noteId: source.noteId,
    ...overrides,
  };
}

const map = {
  version: 4,
  taxonomy_version: 2,
  syllabus_note_id: null,
  academic_year: "2025/26",
};

describe("topic proposal sources", () => {
  it("sends a substantial syllabus alone", () => {
    const preview = taxonomyPreview({
      sources: [material(0, 2_000), material(1, 900), material(2, 900)],
      syllabusIncluded: true,
    });
    expect(preview.sources.map((source) => source.noteId)).toEqual([ids[0]]);
    expect(preview.fullSources).toBe(1);
  });

  it("does not promote a long lecture to syllabus when the syllabus was left out", () => {
    // the map still names a syllabus, but it was removed from the map or had no readable text
    const preview = taxonomyPreview({
      sources: [material(0, 2_000), material(1, 900), material(2, 900)],
      syllabusIncluded: false,
    });
    expect(preview.fullSources).toBe(0);
    expect(preview.sources.map((source) => source.noteId)).toEqual(ids);
    expect(preview.previewChars).toBeLessThanOrEqual(3_000);
  });
});

describe("publishing a finished study job", () => {
  it("keeps a classification when only the map name or settings changed", () => {
    expect(mapChangedSince("classify", { ...map, version: 5 }, input())).toBe(
      false,
    );
    expect(mapChangedSince("paper", { ...map, version: 9 }, input())).toBe(
      false,
    );
  });

  it("rejects a classification when topic meaning changed", () => {
    expect(
      mapChangedSince("classify", { ...map, taxonomy_version: 3 }, input()),
    ).toBe(true);
  });

  it("rejects a paper analysis when the map's academic year changed", () => {
    expect(
      mapChangedSince("paper", { ...map, academic_year: "2026/27" }, input()),
    ).toBe(true);
  });

  it("rejects a topic proposal after any map edit or syllabus change", () => {
    expect(mapChangedSince("taxonomy", { ...map, version: 5 }, input())).toBe(
      true,
    );
    expect(
      mapChangedSince(
        "taxonomy",
        { ...map, syllabus_note_id: ids[1] },
        input({ syllabusNoteId: null }),
      ),
    ).toBe(true);
    expect(mapChangedSince("taxonomy", map, input())).toBe(false);
  });
});

describe("failed study jobs", () => {
  it("stores only safe messages", () => {
    expect(
      failureMessage(new Error("Bearer private-token provider body"), false),
    ).toBe(messages.provider);
    expect(failureMessage(new StudyJobError(messages.changed), false)).toBe(
      messages.changed,
    );
    expect(failureMessage(new ApiError(400, messages.topics), false)).toBe(
      messages.topics,
    );
    expect(
      failureMessage(
        new ApiError(400, "internal detail of another kind"),
        false,
      ),
    ).toBe(messages.provider);
    expect(
      failureMessage(new ApiError(404, "Study map not found"), false),
    ).toBe(messages.map);
    expect(failureMessage(new z.ZodError([]), false)).toBe(messages.invalid);
    expect(failureMessage(new StudyJobError(messages.changed), true)).toBe(
      messages.lease,
    );
  });
});
