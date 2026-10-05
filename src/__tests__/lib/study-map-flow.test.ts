import { describe, expect, it } from "vitest";
import {
  assignmentSources,
  flowLinks,
  inferWeek,
  layoutModule,
  mentionedTopics,
  moduleItems,
  orderTopics,
  topicBridges,
  topicTrail,
  UNSORTED,
} from "@/lib/study-map/flow";
import {
  boardSchema,
  currentBoard,
  emptyBoard,
  type StudyAssignment,
  type StudyMapSnapshot,
  type StudyMaterial,
  type StudyTopic,
  type TopicAssociation,
} from "@/lib/study-map/types";

const MAP = "00000000-0000-4000-8000-000000000001";
const OTHER_MAP = "00000000-0000-4000-8000-000000000002";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function topic(
  n: number,
  name: string,
  extra: Partial<StudyTopic> = {},
): StudyTopic {
  return {
    id: id(100 + n),
    name,
    definition: `${name} definition`,
    includes: "",
    excludes: "",
    aliases: [],
    parentId: null,
    sources: [],
    reviewed: true,
    ...extra,
  };
}

function association(
  topicId: string,
  relevance: "core" | "supporting" = "core",
  status: TopicAssociation["status"] = "accepted",
): TopicAssociation {
  return {
    topicId,
    relevance,
    probability: 0.9,
    evidence: [],
    status,
    origin: "automatic",
  };
}

function material(
  n: number,
  title: string,
  associations: TopicAssociation[],
  extra: Partial<StudyMaterial> = {},
): StudyMaterial {
  return {
    noteId: id(n),
    mapId: MAP,
    title,
    excerpt: "",
    kind: "notes",
    labels: [],
    associations,
    overrides: { topics: {}, sourceHash: "", taxonomyVersion: 0 },
    status: "classified",
    sourceHash: "a",
    currentHash: "a",
    taxonomyVersion: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    classifiedAt: "2026-01-01T00:00:00.000Z",
    isFile: false,
    mimeType: null,
    references: [],
    folder: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    imported: false,
    ...extra,
  };
}

function assignment(
  n: number,
  title: string,
  description: string,
  noteIds: string[] = [],
): StudyAssignment {
  return {
    id: id(n),
    canvas_course_id: "42",
    canvas_assignment_id: String(n),
    title,
    description,
    course_name: "Systems Programming",
    course_color: null,
    due_at: null,
    status: "upcoming",
    estimated_hours: null,
    logged_hours: 0,
    source: "canvas",
    assignment_type: "assignment",
    submitted_at: null,
    score: null,
    points_possible: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    noteIds,
  };
}

function snapshot(
  topics: StudyTopic[],
  materials: StudyMaterial[],
  assignments: StudyAssignment[] = [],
  mapId = MAP,
): StudyMapSnapshot {
  return {
    map: {
      id: mapId,
      name: "Systems Programming",
      academicYear: "2025/26",
      topicCount: topics.length,
      materialCount: materials.length,
      updatedAt: "2026-01-01T00:00:00.000Z",
      rootNoteId: null,
      canvasCourseId: "42",
      syllabusNoteId: null,
      taxonomyVersion: 1,
      version: 1,
      boardVersion: 0,
      autoClassify: false,
      topics,
      board: emptyBoard(),
    },
    materials: materials.map((entry) => ({ ...entry, mapId })),
    assignments,
    papers: [],
    jobs: [],
    provider: { classifier: "mock", ready: true, generationReady: true },
  };
}

describe("week inference", () => {
  it("prefers explicit weeks over session numbers and the title over its folder", () => {
    expect(inferWeek("Lecture 3: Pointers", "Week 4")).toEqual({
      week: 4,
      source: "folder",
    });
    expect(inferWeek("Week 2 lab sheet", "Lab 5")).toEqual({
      week: 2,
      source: "title",
    });
    expect(inferWeek("Pointers", "W03 - Memory")).toEqual({
      week: 3,
      source: "folder",
    });
    expect(inferWeek("07 - Bit manipulation.pdf", null)).toEqual({
      week: 7,
      source: "title",
    });
    expect(inferWeek("Lab 1: loops", null)).toEqual({
      week: 1,
      source: "title",
    });
  });

  it("leaves years, exams and unnumbered titles without a week", () => {
    expect(inferWeek("Past paper 2025: Summer", "Exams")).toBeNull();
    expect(
      inferWeek("Processes: states and context switches", "Operating Systems"),
    ).toBeNull();
    expect(inferWeek("Week 60 review", null)).toBeNull();
  });
});

describe("flow items", () => {
  const pointers = topic(1, "Pointers", { aliases: ["pointer arithmetic"] });
  const memory = topic(2, "Memory management");
  const arrays = topic(3, "Arrays and strings");

  it("shows an extracted Markdown version through its original file and keeps reference documents out of the flow", () => {
    const pdf = material(1, "Week 3 slides.pdf", [association(pointers.id)], {
      isFile: true,
      mimeType: "application/pdf",
    });
    const text = material(2, "Week 3 slides.md", [association(pointers.id)], {
      references: [
        {
          id: pdf.noteId,
          title: pdf.title,
          kind: "file",
          relation: "extraction",
        },
      ],
    });
    const syllabus = material(3, "Syllabus", [], { kind: "syllabus" });
    const items = moduleItems(
      snapshot([pointers], [pdf, text, syllabus]),
      emptyBoard(),
    );
    expect(items.map((item) => item.title)).toEqual(["Week 3 slides.pdf"]);
    expect(items[0]).toMatchObject({
      kind: "pdf",
      week: 3,
      weekSource: "title",
      textVersionId: text.noteId,
    });
  });

  it("recognises extracted Markdown that was itself uploaded as a file", () => {
    const pdf = material(1, "lecture-slides.pdf", [association(pointers.id)], {
      isFile: true,
      mimeType: "application/pdf",
      folder: "Week 6",
    });
    const uploaded = material(
      2,
      "lecture-slides.md",
      [association(pointers.id)],
      {
        isFile: true,
        mimeType: "text/markdown",
        references: [
          {
            id: pdf.noteId,
            title: pdf.title,
            kind: "file",
            relation: "extraction",
          },
        ],
      },
    );
    const image = material(3, "diagram.png", [], {
      isFile: true,
      mimeType: "image/png",
      references: [
        {
          id: pdf.noteId,
          title: pdf.title,
          kind: "file",
          relation: "extraction",
        },
      ],
    });
    const items = moduleItems(
      snapshot([pointers], [pdf, uploaded, image]),
      emptyBoard(),
    );
    expect(items.map((item) => item.title)).toEqual([
      "lecture-slides.pdf",
      "diagram.png",
    ]);
    expect(items[0]).toMatchObject({
      week: 6,
      weekSource: "folder",
      textVersionId: uploaded.noteId,
    });
  });

  it("lets a saved week override inference, including an explicit no-week choice", () => {
    const note = material(1, "Lecture 4", [association(pointers.id)]);
    const board = { ...emptyBoard(), weeks: { [`note:${note.noteId}`]: 6 } };
    expect(moduleItems(snapshot([pointers], [note]), board)[0]).toMatchObject({
      week: 6,
      weekSource: "set",
    });
    const unscheduled = {
      ...emptyBoard(),
      weeks: { [`note:${note.noteId}`]: 0 },
    };
    expect(
      moduleItems(snapshot([pointers], [note]), unscheduled)[0],
    ).toMatchObject({ week: null, weekSource: "set" });
  });

  it("matches assignment briefs to topics by whole names and aliases and places them after attached material", () => {
    const lecture = material(1, "Lecture 5: malloc", [association(memory.id)], {
      folder: "Week 5",
    });
    const brief = assignment(
      50,
      "Assignment 1: string library",
      "<p>Use <b>pointer arithmetic</b> and memory management. No arrays-only shortcuts.</p>",
      [lecture.noteId],
    );
    const items = moduleItems(
      snapshot([pointers, memory, arrays], [lecture], [brief]),
      emptyBoard(),
    );
    const card = items.find((item) => item.kind === "assignment");
    expect(card?.tags.map((tag) => tag.topicId).sort()).toEqual(
      [pointers.id, memory.id].sort(),
    );
    expect(card).toMatchObject({ week: 5, weekSource: "linked" });
    expect(mentionedTopics("Pointerless designs", [pointers])).toEqual([]);
    const early = material(2, "Week 2: pointers", [association(pointers.id)]);
    const late = material(3, "Week 9: pointer revision", [
      association(pointers.id, "supporting"),
    ]);
    const loose = assignment(51, "Pointer quiz", "Questions on pointers.");
    const unattached = moduleItems(
      snapshot([pointers], [early, late], [loose]),
      emptyBoard(),
    ).find((item) => item.kind === "assignment");
    expect(unattached).toMatchObject({ week: 2, weekSource: "linked" });
  });

  it("rejected topics do not place a card while suggestions do", () => {
    const note = material(1, "Week 1", [
      association(pointers.id, "core", "rejected"),
      association(memory.id, "core", "suggested"),
    ]);
    expect(
      moduleItems(snapshot([pointers, memory], [note]), emptyBoard())[0].tags,
    ).toEqual([
      expect.objectContaining({ topicId: memory.id, suggested: true }),
    ]);
  });
});

describe("layout", () => {
  const types = topic(1, "Types");
  const pointers = topic(2, "Pointers");
  const bits = topic(3, "Bit manipulation");
  const memory = topic(4, "Memory management");

  it("keeps parents before children and chains siblings by shared material", () => {
    const control = topic(5, "Control flow", { parentId: types.id });
    const notes = [
      material(1, "Week 3", [association(pointers.id), association(memory.id)]),
      material(2, "Week 4", [association(pointers.id), association(memory.id)]),
      material(3, "Week 1", [association(types.id)]),
    ];
    const items = moduleItems(
      snapshot([types, control, pointers, bits, memory], notes),
      emptyBoard(),
    );
    expect(
      orderTopics([types, control, pointers, bits, memory], items).map(
        (entry) => entry.name,
      ),
    ).toEqual([
      "Types",
      "Control flow",
      "Pointers",
      "Memory management",
      "Bit manipulation",
    ]);
  });

  it("places cards in their week column between their topics, without overlap, and keeps manual positions", () => {
    const both = material(1, "Week 3: pointers and memory", [
      association(pointers.id),
      association(memory.id),
    ]);
    const onlyPointers = material(2, "Week 3: pointer basics", [
      association(pointers.id),
    ]);
    const later = material(3, "Week 5: bitmasks", [association(bits.id)]);
    const loose = material(4, "Unsorted reading", []);
    const items = moduleItems(
      snapshot([pointers, memory, bits], [both, onlyPointers, later, loose]),
      emptyBoard(),
    );
    const layout = layoutModule(MAP, [pointers, memory, bits], items, []);
    expect(layout.columns.map((column) => column.week)).toEqual([3, 5, null]);
    expect(layout.rows.at(-1)?.key).toBe(UNSORTED);
    const a = layout.positions.get(`note:${both.noteId}`)!;
    const b = layout.positions.get(`note:${onlyPointers.noteId}`)!;
    expect(a.x).toBe(b.x);
    const [upper, lower] = a.y < b.y ? [a, b] : [b, a];
    expect(lower.y - upper.y).toBeGreaterThanOrEqual(140);
    expect(layout.positions.get(`note:${later.noteId}`)!.x).toBeGreaterThan(
      a.x,
    );
    const moved = layoutModule(MAP, [pointers, memory, bits], items, [
      { id: `note:${both.noteId}`, x: 9, y: 11, pinned: true, topicId: null },
    ]);
    expect(moved.positions.get(`note:${both.noteId}`)).toEqual({
      x: 9,
      y: 11,
      manual: true,
    });
  });

  it("orders a topic trail by week and lists assignment sources with attached files first", () => {
    const first = material(1, "Week 2: pointers", [association(pointers.id)]);
    const second = material(2, "Week 4: pointer arithmetic", [
      association(pointers.id),
      association(memory.id),
    ]);
    const supporting = material(3, "Week 1: types", [
      association(types.id),
      association(pointers.id, "supporting"),
    ]);
    const attached = material(4, "Starter code", [], { folder: "Week 5" });
    const brief = assignment(
      60,
      "String library",
      "pointers and memory management",
      [attached.noteId],
    );
    const items = moduleItems(
      snapshot(
        [types, pointers, memory],
        [second, first, supporting, attached],
        [brief],
      ),
      emptyBoard(),
    );
    const layout = layoutModule(MAP, [types, pointers, memory], items, []);
    expect(
      topicTrail(pointers.id, items, layout).map((item) => item.title),
    ).toEqual([
      "Week 2: pointers",
      "Week 4: pointer arithmetic",
      "String library",
    ]);
    const card = items.find((item) => item.kind === "assignment")!;
    expect(assignmentSources(card, items).map((item) => item.title)).toEqual([
      "Starter code",
      "Week 4: pointer arithmetic",
      "Week 2: pointers",
    ]);
  });
});

describe("relations", () => {
  it("links stored note references across modules, follows text versions, and bridges related topics", () => {
    const vm = topic(1, "Virtual Memory", { aliases: ["paging"] });
    const memory = topic(2, "Memory management", { aliases: ["Paging"] });
    const pdf = material(1, "Week 6 slides.pdf", [association(vm.id)], {
      isFile: true,
      mimeType: "application/pdf",
    });
    const text = material(2, "Week 6 slides.md", [], {
      references: [
        {
          id: pdf.noteId,
          title: pdf.title,
          kind: "file",
          relation: "extraction",
        },
      ],
    });
    const os = snapshot([vm], [pdf, text], [], OTHER_MAP);
    const lecture = material(3, "Week 3: pointers", [association(memory.id)], {
      references: [
        {
          id: text.noteId,
          title: text.title,
          kind: "embedded",
          relation: "embedded",
        },
      ],
    });
    const sp = snapshot([memory], [lecture]);
    const modules = [
      {
        mapId: MAP,
        topics: [memory],
        items: moduleItems(sp, emptyBoard()),
        board: emptyBoard(),
      },
      {
        mapId: OTHER_MAP,
        topics: [vm],
        items: moduleItems(os, emptyBoard()),
        board: emptyBoard(),
      },
    ];
    const links = flowLinks(modules);
    expect(links).toEqual([
      expect.objectContaining({
        source: `note:${lecture.noteId}`,
        target: `note:${pdf.noteId}`,
        label: "links to",
        origin: "note",
      }),
    ]);
    const bridges = topicBridges(modules, links);
    expect(bridges.map((bridge) => bridge.reason).sort()).toEqual([
      "linked notes",
      "same name",
    ]);
  });

  it("starts earlier layouts fresh but keeps their note links", () => {
    const legacy = boardSchema.parse({
      placements: [
        { id: `note:${id(1)}`, x: 5, y: 5, pinned: false, topicId: null },
      ],
      links: [
        {
          id: id(900),
          source: `note:${id(1)}`,
          target: `note:${id(2)}`,
          label: "builds on",
        },
        {
          id: id(901),
          source: `topic:${id(3)}`,
          target: `note:${id(2)}`,
          label: "defines",
        },
      ],
      viewport: null,
      scene: { version: 1, elements: [] },
    });
    expect(currentBoard(legacy)).toEqual({
      ...emptyBoard(),
      links: [legacy.links[0]],
    });
  });
});
