import { describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));

import { buildTagsView, type ScopeNoteRow } from "@/lib/notes/storage/tags-view";
import { groupByKind, type TagsViewFile } from "@/lib/notes/tags-view";

const MAP = "11111111-1111-4111-8111-111111111111";
const SCHEDULING = "22222222-2222-4222-8222-222222222222";
const MEMORY = "33333333-3333-4333-8333-333333333333";

function note(row: Partial<ScopeNoteRow> & Pick<ScopeNoteRow, "note_id">): ScopeNoteRow {
  return {
    parent_id: "ct213",
    root_id: "ct213",
    title: row.note_id,
    is_folder: false,
    s3_key: null,
    mime_type: null,
    extracted_from_note_id: null,
    tag_content: null,
    ...row,
  };
}

const notes: ScopeNoteRow[] = [
  note({ note_id: "ct213", parent_id: null, title: "CT213 Operating Systems", is_folder: true }),
  note({ note_id: "slides", title: "Lecture Slides", is_folder: true }),
  note({ note_id: "bundle", parent_id: "slides", title: "Lecture 4", is_folder: true }),
  note({ note_id: "pdf", parent_id: "bundle", title: "Lecture 4.pdf", s3_key: "k/lecture-4.pdf", mime_type: "application/pdf" }),
  note({ note_id: "pdf-note", parent_id: "bundle", title: "Lecture 4.md", extracted_from_note_id: "pdf", tag_content: "text\n#exam-prep\n" }),
  note({ note_id: "mlfq", title: "MLFQ rules.md", tag_content: "#exam-prep #Revise" }),
  note({ note_id: "random", title: "random thoughts.md" }),
];

const material = (noteId: string, topicId: string, status: "accepted" | "suggested", kind = "notes") => ({
  map_id: MAP,
  note_id: noteId,
  associations: [{ topicId, relevance: "core", probability: 0.9, evidence: [], status, origin: "automatic" }],
  overrides: { topics: {}, sourceHash: "", taxonomyVersion: 0 },
  taxonomy_version: 1,
  kind,
});

describe("buildTagsView", () => {
  const view = buildTagsView({
    roots: [{ id: "ct213", title: "CT213 Operating Systems" }],
    notes,
    maps: [
      {
        id: MAP,
        name: "CT213",
        root_id: "ct213",
        taxonomy_version: 1,
        topics: [{ id: SCHEDULING, name: "Scheduling" }, { id: MEMORY, name: "Memory" }],
      },
    ],
    materials: [material("pdf-note", SCHEDULING, "accepted", "slides"), material("mlfq", SCHEDULING, "suggested")],
  });

  it("shows a PDF and its extracted note once, with the folder path and no bundle folder", () => {
    const files = view.courses[0].topics[0].files;
    expect(files.map((file) => [file.id, file.noteId, file.title, file.path])).toEqual([
      ["pdf", "pdf-note", "Lecture 4", "Lecture Slides"],
    ]);
  });

  it("files only confirmed picks under a topic and counts the suggestions waiting in To review", () => {
    expect(view.courses[0].topics.map((topic) => [topic.name, topic.files.map((file) => file.id), topic.suggestedCount])).toEqual([
      ["Scheduling", ["pdf"], 1],
    ]);
    expect(view.courses[0].review.map((file) => file.id)).toEqual(["mlfq"]);
  });

  it("keeps a topic with only suggestions as a header, so the file is listed once", () => {
    const pending = buildTagsView({
      roots: [{ id: "ct213", title: "CT213 Operating Systems" }],
      notes,
      maps: [{ id: MAP, name: "CT213", root_id: "ct213", taxonomy_version: 1, topics: [{ id: SCHEDULING, name: "Scheduling" }, { id: MEMORY, name: "Memory" }] }],
      materials: [material("mlfq", SCHEDULING, "suggested"), material("mlfq", MEMORY, "suggested")],
    });
    expect(pending.courses[0].topics.map((topic) => [topic.name, topic.files.length, topic.suggestedCount])).toEqual([
      ["Scheduling", 0, 1],
      ["Memory", 0, 1],
    ]);
    expect(pending.courses[0].review.map((file) => [file.id, file.topics.map((topic) => topic.name)])).toEqual([
      ["mlfq", ["Scheduling", "Memory"]],
    ]);
  });

  it("counts #tags within the scope, reading the PDF's tags from its note", () => {
    expect(view.tags.map((entry) => [entry.tag, entry.files.map((file) => file.id)])).toEqual([
      ["exam-prep", ["pdf", "mlfq"]],
      ["revise", ["mlfq"]],
    ]);
  });

  it("puts files with no topic at all under not tagged yet", () => {
    expect(view.courses[0].untagged.map((file) => file.id)).toEqual(["random"]);
  });

  it("lists files with suggestions to review, and nothing when all are confirmed", () => {
    expect(view.courses[0].review.map((file) => [file.id, file.changed, file.topics.map((topic) => topic.name)])).toEqual([
      ["mlfq", false, ["Scheduling"]],
    ]);
    const settled = buildTagsView({
      roots: [{ id: "ct213", title: "CT213 Operating Systems" }],
      notes,
      maps: [{ id: MAP, name: "CT213", root_id: "ct213", taxonomy_version: 1, topics: [{ id: SCHEDULING, name: "Scheduling" }] }],
      materials: [material("mlfq", SCHEDULING, "accepted")],
    });
    expect(settled.courses[0].review).toEqual([]);
  });

  it("marks a correction made against an older topic list as changed", () => {
    const stale = buildTagsView({
      roots: [{ id: "ct213", title: "CT213 Operating Systems" }],
      notes,
      maps: [{ id: MAP, name: "CT213", root_id: "ct213", taxonomy_version: 2, topics: [{ id: SCHEDULING, name: "Scheduling" }, { id: MEMORY, name: "Memory" }] }],
      materials: [{
        ...material("mlfq", SCHEDULING, "accepted"),
        taxonomy_version: 2,
        overrides: { topics: { [MEMORY]: "core" }, sourceHash: "x", taxonomyVersion: 1 },
      }],
    });
    expect(stale.courses[0].review.map((file) => [file.id, file.changed, file.topics.map((topic) => topic.name)])).toEqual([
      ["mlfq", true, ["Memory"]],
    ]);
  });

  it("carries each file's kind from the map, preferring the saved correction", () => {
    const corrected = buildTagsView({
      roots: [{ id: "ct213", title: "CT213 Operating Systems" }],
      notes,
      maps: [{ id: MAP, name: "CT213", root_id: "ct213", taxonomy_version: 1, topics: [{ id: SCHEDULING, name: "Scheduling" }] }],
      materials: [{
        ...material("mlfq", SCHEDULING, "accepted"),
        overrides: { kind: "past_paper", topics: {}, sourceHash: "", taxonomyVersion: 0 },
      }],
    });
    expect(view.courses[0].topics[0].files.map((file) => file.kind)).toEqual(["slides"]);
    expect(corrected.courses[0].topics[0].files[0].kind).toBe("past_paper");
  });
});

describe("groupByKind", () => {
  const file = (id: string, kind: TagsViewFile["kind"]): TagsViewFile => ({
    id,
    noteId: id,
    title: id,
    path: "",
    rootId: "ct213",
    isFile: false,
    mimeType: null,
    main: false,
    suggested: false,
    kind,
  });

  it("orders slides, then past papers, then notes, and labels a kind with one file", () => {
    const groups = groupByKind([file("mlfq", "notes"), file("2024", "past_paper"), file("l4", "slides"), file("l5", "slides")]);
    expect(groups.map((group) => [group.kind, group.files.map((entry) => entry.id)])).toEqual([
      ["slides", ["l4", "l5"]],
      ["past_paper", ["2024"]],
      ["notes", ["mlfq"]],
    ]);
  });

  it("returns one group when every file is the same kind, and counts unknown kinds as other", () => {
    expect(groupByKind([file("a", null), file("b", "other")])).toEqual([
      { kind: "other", files: [file("a", null), file("b", "other")] },
    ]);
  });
});
