import { describe, expect, it } from "vitest";
import {
  assignmentSources,
  CARD_WIDTH,
  flowLinks,
  inferWeek,
  layoutModule,
  mentionedTopics,
  moduleItems,
  orderTopics,
  primaryTopic,
  topicBridges,
  topicRelations,
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

  it("merges a note and a PDF of the same name into a single card in its grouping", () => {
    const pdf = material(
      1,
      "Pointers Overview.pdf",
      [association(pointers.id, "supporting", "accepted")],
      {
        isFile: true,
        mimeType: "application/pdf",
      },
    );
    const text = material(
      2,
      "Pointers Overview",
      [
        association(pointers.id, "core", "accepted"),
        association(memory.id, "supporting", "accepted"),
      ],
      {
        folder: "Week 1",
      },
    );
    const items = moduleItems(
      snapshot([pointers, memory], [pdf, text]),
      emptyBoard(),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "pdf",
      title: "Pointers Overview.pdf",
      textVersionId: text.noteId,
      week: 1,
      weekSource: "folder",
    });
    const tags = items[0].tags;
    const pointersTag = tags.find((t) => t.topicId === pointers.id);
    const memoryTag = tags.find((t) => t.topicId === memory.id);
    expect(pointersTag).toMatchObject({ relevance: "core" });
    expect(memoryTag).toMatchObject({ relevance: "supporting" });

    const catalogue = new Map([
      [pointers.id, 0],
      [memory.id, 1],
    ]);
    expect(primaryTopic(items[0], catalogue)).toBe(pointers.id);

    const layout = layoutModule(MAP, [pointers, memory], items, []);
    const pointersCluster = layout.clusters.find((c) => c.key === pointers.id);
    expect(pointersCluster?.refs).toEqual([items[0].ref]);
  });

  it("pairs note and PDF by matching folder when multiple items share the same title", () => {
    const pdf1 = material(1, "Slides.pdf", [association(pointers.id)], {
      isFile: true,
      mimeType: "application/pdf",
      folder: "Week 1",
    });
    const pdf2 = material(2, "Slides.pdf", [association(memory.id)], {
      isFile: true,
      mimeType: "application/pdf",
      folder: "Week 2",
    });
    const note1 = material(3, "Slides", [association(pointers.id)], {
      folder: "Week 1",
    });
    const note2 = material(4, "Slides.md", [association(memory.id)], {
      folder: "Week 2",
    });
    const items = moduleItems(
      snapshot([pointers, memory], [pdf1, pdf2, note1, note2]),
      emptyBoard(),
    );
    expect(items).toHaveLength(2);
    const item1 = items.find((i) => i.id === pdf1.noteId);
    const item2 = items.find((i) => i.id === pdf2.noteId);
    expect(item1?.textVersionId).toBe(note1.noteId);
    expect(item2?.textVersionId).toBe(note2.noteId);
  });

  it("preserves links and manual placements from merged text notes", () => {
    const pdf = material(1, "Week 2 - Memory.pdf", [], {
      isFile: true,
      mimeType: "application/pdf",
    });
    const otherNote = material(3, "Week 1 - Intro", [association(pointers.id)]);
    const note = material(2, "Week 2 - Memory", [association(memory.id)], {
      references: [
        {
          id: otherNote.noteId,
          title: otherNote.title,
          kind: "note",
          relation: "embedded",
        },
      ],
    });
    const board = {
      ...emptyBoard(),
      placements: [
        {
          id: `note:${note.noteId}` as const,
          x: 120,
          y: 340,
          pinned: true,
          topicId: null,
        },
      ],
    };
    const items = moduleItems(
      snapshot([pointers, memory], [pdf, note, otherNote]),
      board,
    );
    expect(items).toHaveLength(2);
    const merged = items.find((i) => i.id === pdf.noteId)!;
    expect(merged.textVersionId).toBe(note.noteId);

    const layout = layoutModule(
      MAP,
      [pointers, memory],
      items,
      board.placements,
    );
    expect(layout.positions.get(merged.ref)).toEqual({
      x: 120,
      y: 340,
      manual: true,
    });

    const links = flowLinks([{ items, board }]);
    expect(
      links.some(
        (l) =>
          l.source === merged.ref && l.target === `note:${otherNote.noteId}`,
      ),
    ).toBe(true);
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

  it("files each card under its heaviest topic, breaking ties by catalogue order and briefs by how often they name a topic", () => {
    const supportingFirst = material(1, "Lecture 1", [
      association(pointers.id, "supporting"),
      association(memory.id),
    ]);
    const tie = material(2, "Lecture 2", [
      association(memory.id),
      association(pointers.id),
    ]);
    const reviewedBeatsSuggested = material(3, "Lecture 3", [
      association(types.id, "core", "suggested"),
      association(bits.id, "supporting"),
    ]);
    const brief = assignment(
      70,
      "Bit manipulation lab",
      "Uses pointers once. Bit manipulation with masks; more bit manipulation.",
    );
    const unnamed = assignment(71, "Reflection", "Write about your week.");
    const catalogue = [types, pointers, bits, memory];
    const items = moduleItems(
      snapshot(
        catalogue,
        [supportingFirst, tie, reviewedBeatsSuggested],
        [brief, unnamed],
      ),
      emptyBoard(),
    );
    const ranks = new Map(catalogue.map((entry, index) => [entry.id, index]));
    const filed = (title: string) =>
      primaryTopic(
        items.find((item) => item.title === title)!,
        ranks,
      );
    expect(filed("Lecture 1")).toBe(memory.id);
    expect(filed("Lecture 2")).toBe(pointers.id);
    // a suggested core weighs 0.7, a reviewed supporting tag 0.4
    expect(filed("Lecture 3")).toBe(types.id);
    expect(filed("Bit manipulation lab")).toBe(bits.id);
    expect(filed("Reflection")).toBe(UNSORTED);
    const layout = layoutModule(MAP, catalogue, items, []);
    expect(layout.primary.get(`assignment:${unnamed.id}`)).toBe(UNSORTED);
  });

  it("orders a cluster by reviewed core first, then week with no week last, then title, in a small grid", () => {
    const notes = [
      material(1, "Week 4: b", [association(pointers.id)]),
      material(2, "Week 2: z", [association(pointers.id, "supporting")]),
      material(3, "Undated a", [association(pointers.id)]),
      material(4, "Week 4: a", [association(pointers.id)]),
      material(5, "Week 1: guess", [
        association(pointers.id, "core", "suggested"),
      ]),
    ];
    const items = moduleItems(snapshot([pointers], notes), emptyBoard());
    const layout = layoutModule(MAP, [pointers], items, []);
    const cluster = layout.clusters[0];
    expect(cluster.key).toBe(pointers.id);
    expect(
      cluster.refs.map((ref) => items.find((item) => item.ref === ref)!.title),
    ).toEqual([
      "Week 4: a",
      "Week 4: b",
      "Undated a",
      "Week 1: guess",
      "Week 2: z",
    ]);
    // five cards use three columns, so the cluster is two rows tall rather than one long stack
    const xs = new Set(cluster.refs.map((ref) => layout.positions.get(ref)!.x));
    const ys = new Set(cluster.refs.map((ref) => layout.positions.get(ref)!.y));
    expect(xs.size).toBe(3);
    expect(ys.size).toBe(2);
  });

  it("packs clusters without overlap, keeps every card inside its frame, and puts unsorted material last", () => {
    const catalogue = [types, pointers, bits, memory];
    const notes = Array.from({ length: 23 }, (_, index) =>
      material(index + 1, `Week ${(index % 12) + 1}: note ${index}`, [
        association(catalogue[index % catalogue.length].id),
        ...(index % 3 === 0
          ? [association(catalogue[(index + 1) % 4].id, "supporting")]
          : []),
      ]),
    );
    const loose = material(40, "Reading list", []);
    const pdf = material(41, "Slides.pdf", [association(bits.id)], {
      isFile: true,
      mimeType: "application/pdf",
    });
    const items = moduleItems(
      snapshot(catalogue, [...notes, loose, pdf]),
      emptyBoard(),
    );
    const layout = layoutModule(MAP, catalogue, items, []);
    expect(layout.clusters.at(-1)).toMatchObject({
      key: UNSORTED,
      topic: null,
      refs: [`note:${loose.noteId}`],
    });
    const overlaps = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
    ) =>
      a.x < b.x + b.width &&
      b.x < a.x + a.width &&
      a.y < b.y + b.height &&
      b.y < a.y + a.height;
    for (const [index, cluster] of layout.clusters.entries()) {
      for (const other of layout.clusters.slice(index + 1))
        expect(overlaps(cluster, other)).toBe(false);
      for (const ref of cluster.refs) {
        const position = layout.positions.get(ref)!;
        const height = items.find((item) => item.ref === ref)!.height;
        expect(position.x).toBeGreaterThanOrEqual(cluster.x);
        expect(position.y).toBeGreaterThanOrEqual(cluster.y);
        expect(position.x + CARD_WIDTH).toBeLessThanOrEqual(
          cluster.x + cluster.width,
        );
        expect(position.y + height).toBeLessThanOrEqual(
          cluster.y + cluster.height,
        );
      }
    }
    expect(layout.clusters.flatMap((cluster) => cluster.refs).sort()).toEqual(
      items.map((item) => item.ref).sort(),
    );
    expect(layout.width).toBeGreaterThanOrEqual(
      Math.max(...layout.clusters.map((cluster) => cluster.x + cluster.width)),
    );
  });

  it("puts related topics next to each other, counting shared cards and note links", () => {
    // in catalogue order pointers would be followed by types; its note link to bits wins instead
    const catalogue = [pointers, types, memory, bits];
    const shared = material(1, "Lecture 1", [
      association(types.id),
      association(memory.id),
    ]);
    const typesNote = material(2, "Lecture 2", [association(types.id)]);
    const bitsNote = material(3, "Lecture 3", [association(bits.id)]);
    const pointersNote = material(4, "Lecture 4", [association(pointers.id)], {
      references: [
        {
          id: bitsNote.noteId,
          title: bitsNote.title,
          kind: "note",
        },
      ],
    });
    const memoryNote = material(5, "Lecture 5", [association(memory.id)]);
    const notes = [shared, typesNote, bitsNote, pointersNote, memoryNote];
    const items = moduleItems(snapshot(catalogue, notes), emptyBoard());
    const links = flowLinks([{ items, board: emptyBoard() }]);
    const relations = topicRelations(catalogue, items, links);
    const pair = (left: string, right: string) =>
      left < right ? { a: left, b: right } : { a: right, b: left };
    expect(relations).toEqual(
      expect.arrayContaining([
        { ...pair(types.id, memory.id), weight: 1 },
        { ...pair(pointers.id, bits.id), weight: 1 },
      ]),
    );
    expect(relations).toHaveLength(2);
    expect(orderTopics(catalogue, items).map((entry) => entry.name)).toEqual([
      "Pointers",
      "Types",
      "Memory management",
      "Bit manipulation",
    ]);
    expect(
      orderTopics(catalogue, items, links).map((entry) => entry.name),
    ).toEqual(["Pointers", "Bit manipulation", "Types", "Memory management"]);
    const layout = layoutModule(MAP, catalogue, items, [], links);
    const cluster = (key: string) =>
      layout.clusters.find((entry) => entry.key === key)!;
    expect(layout.clusters.map((entry) => entry.key)).toEqual([
      pointers.id,
      bits.id,
      types.id,
      memory.id,
    ]);
    const pointersCluster = cluster(pointers.id);
    const bitsCluster = cluster(bits.id);
    // packed left to right on one shelf with nothing between them
    expect(bitsCluster.y).toBe(pointersCluster.y);
    expect(bitsCluster.x).toBeGreaterThan(pointersCluster.x);
    expect(
      layout.clusters.filter(
        (entry) =>
          entry.y === pointersCluster.y &&
          entry.x > pointersCluster.x &&
          entry.x < bitsCluster.x,
      ),
    ).toEqual([]);
    expect(layout.relations).toHaveLength(2);
  });

  it("keeps at most three relation edges per topic, strongest first", () => {
    const catalogue = [types, pointers, bits, memory, topic(5, "Files")];
    const hub = catalogue[0];
    const notes = catalogue
      .slice(1)
      .flatMap((other, index) =>
        Array.from({ length: index + 1 }, (_, copy) =>
          material(10 * (index + 1) + copy, `Lecture ${other.name} ${copy}`, [
            association(hub.id),
            association(other.id),
          ]),
        ),
      );
    const items = moduleItems(snapshot(catalogue, notes), emptyBoard());
    const layout = layoutModule(MAP, catalogue, items, []);
    const touching = layout.relations.filter(
      (relation) => relation.a === hub.id || relation.b === hub.id,
    );
    expect(touching).toHaveLength(3);
    // the weakest partner, pointers with one shared card, is the one left out
    expect(
      touching.some(
        (relation) => relation.a === pointers.id || relation.b === pointers.id,
      ),
    ).toBe(false);
  });

  it("is deterministic regardless of input order and keeps manual positions", () => {
    const catalogue = [types, pointers, bits, memory];
    const notes = Array.from({ length: 12 }, (_, index) =>
      material(index + 1, `Note ${index}`, [
        association(catalogue[index % 4].id),
        association(catalogue[(index + 2) % 4].id, "supporting"),
      ]),
    );
    const items = moduleItems(snapshot(catalogue, notes), emptyBoard());
    const first = layoutModule(MAP, catalogue, items, []);
    const again = layoutModule(MAP, catalogue, [...items].reverse(), []);
    expect(again.clusters).toEqual(first.clusters);
    expect(new Map([...again.positions].sort())).toEqual(
      new Map([...first.positions].sort()),
    );
    const ref = `note:${notes[0].noteId}`;
    const moved = layoutModule(MAP, catalogue, items, [
      { id: ref, x: 9, y: 11, pinned: true, topicId: null },
    ]);
    expect(moved.positions.get(ref)).toEqual({ x: 9, y: 11, manual: true });
    expect(moved.clusters).toEqual(first.clusters);
  });

  it("shows one unsorted cluster when a module has no topics", () => {
    const items = moduleItems(
      snapshot([], [material(1, "Week 1", []), material(2, "Week 2", [])]),
      emptyBoard(),
    );
    const layout = layoutModule(MAP, [], items, []);
    expect(layout.clusters.map((cluster) => cluster.key)).toEqual([UNSORTED]);
    expect(layout.clusters[0].refs).toHaveLength(2);
    expect(layout.relations).toEqual([]);
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

  it("reads a weekly-grid board as a fresh layout that keeps its links and week overrides", () => {
    const link = {
      id: id(902),
      source: `assignment:${id(4)}`,
      target: `note:${id(2)}`,
      label: "needed for",
    };
    const weekly = boardSchema.parse({
      layout: 2,
      placements: [
        { id: `note:${id(1)}`, x: 300, y: 400, pinned: true, topicId: null },
      ],
      weeks: { [`note:${id(1)}`]: 4, [`assignment:${id(4)}`]: 0 },
      links: [link],
      viewport: { x: 1, y: 2, zoom: 1 },
    });
    const fresh = currentBoard(weekly);
    expect(fresh).toEqual({
      ...emptyBoard(),
      weeks: weekly.weeks,
      links: [link],
    });
    expect(fresh.layout).toBe(3);
    expect(currentBoard(fresh)).toBe(fresh);
    expect(emptyBoard().layout).toBe(3);
  });
});
