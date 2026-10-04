import { describe, expect, it } from "vitest";
import {
  boardSceneSchema,
  getSceneReference,
  pruneAvailableRefs,
  sanitizeBoardScene,
  sceneReferenceSchema,
  type BoardScene,
  type BoardSceneElement,
} from "@/lib/study-map/board-scene";

const NOTE_ID = "11111111-1111-4111-8111-111111111111";
const TOPIC_ID = "22222222-2222-4222-8222-222222222222";
const MAP_ID = "33333333-3333-4333-8333-333333333333";
type Rectangle = Extract<BoardSceneElement, { type: "rectangle" }>;
type Text = Extract<BoardSceneElement, { type: "text" }>;
type Frame = Extract<BoardSceneElement, { type: "frame" }>;
type Embeddable = Extract<BoardSceneElement, { type: "embeddable" }>;
type Line = Extract<BoardSceneElement, { type: "line" }>;
type Arrow = Extract<BoardSceneElement, { type: "arrow" }>;
type Freehand = Extract<BoardSceneElement, { type: "freedraw" }>;

function rectangle(id: string, overrides: Partial<Rectangle> = {}): Rectangle {
  return {
    id, type: "rectangle", x: 12, y: -24, width: 320, height: 180, angle: 0,
    strokeColor: "#1e293b", backgroundColor: "transparent", fillStyle: "solid",
    strokeWidth: 1, strokeStyle: "solid", roundness: { type: 3 }, roughness: 1,
    opacity: 100, seed: 73, version: 1, versionNonce: 914, index: null,
    isDeleted: false, groupIds: [], frameId: null, boundElements: null,
    updated: 1_791_028_800_000, link: null, locked: false,
    ...overrides,
  };
}

function text(id: string, overrides: Partial<Text> = {}): Text {
  return {
    ...rectangle(id), type: "text", fontSize: 20, fontFamily: 5,
    text: "My drawing annotation", originalText: "My drawing annotation",
    textAlign: "left", verticalAlign: "top", containerId: null,
    autoResize: true, lineHeight: 1.25, ...overrides,
  };
}

function frame(id: string, overrides: Partial<Frame> = {}): Frame {
  return { ...rectangle(id), type: "frame", name: "Revision group", ...overrides };
}

function embed(id: string, kind: "note" | "topic" = "note", overrides: Partial<Embeddable> = {}): Embeddable {
  const referenceId = kind === "note" ? NOTE_ID : TOPIC_ID;
  return {
    ...rectangle(id), type: "embeddable", locked: true,
    link: kind === "note" ? `/notes/${referenceId}` : `/study-map?topic=${referenceId}&map=${MAP_ID}`,
    customData: { studyRef: { kind, id: referenceId } }, ...overrides,
  };
}

function line(id: string, overrides: Partial<Line> = {}): Line {
  return {
    ...rectangle(id), type: "line", points: [[0, 0], [120, 80]], lastCommittedPoint: null,
    startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null,
    ...overrides,
  };
}

function arrow(id: string, overrides: Partial<Arrow> = {}): Arrow {
  return { ...line(id), type: "arrow", elbowed: false, endArrowhead: "arrow", ...overrides };
}

function freehand(id: string, overrides: Partial<Freehand> = {}): Freehand {
  return {
    ...rectangle(id), type: "freedraw", points: [[0, 0], [10, 4], [20, 8]],
    pressures: [0.3, 0.7, 0.5], simulatePressure: false, lastCommittedPoint: null,
    ...overrides,
  };
}

function scene(elements: BoardSceneElement[]): BoardScene {
  return {
    version: 1, elements,
    appState: { scrollX: -350, scrollY: 120, zoom: { value: 1.5 }, viewBackgroundColor: "#ffffff", gridSize: 20 },
  };
}

function sceneInput(elements: readonly unknown[]): unknown {
  return { ...scene([]), elements };
}

describe("board scene persistence", () => {
  it("round-trips native shapes, annotations, freehand, arrows, frames and canonical cards", () => {
    const before = scene([
      rectangle("box", { groupIds: ["revision-group"], frameId: "frame", locked: true }),
      { ...rectangle("circle"), type: "ellipse" },
      { ...rectangle("diamond"), type: "diamond" },
      text("annotation"), freehand("ink"), line("line"),
      arrow("elbow", {
        elbowed: true, startArrowhead: "circle_outline", endArrowhead: "triangle",
        points: [[0, 0], [100, 0], [100, 80]],
        fixedSegments: [{ start: [0, 0], end: [100, 0], index: 1 }],
        startIsSpecial: false, endIsSpecial: null,
      }),
      frame("frame"), embed("note"), embed("topic", "topic"),
    ]);
    const stored: unknown = JSON.parse(JSON.stringify(before));

    expect(sanitizeBoardScene(stored)).toEqual(before);
    expect(getSceneReference(before.elements[8])).toEqual({ kind: "note", id: NOTE_ID });
    expect(getSceneReference(before.elements[9])).toEqual({ kind: "topic", id: TOPIC_ID });
    expect(getSceneReference(before.elements[0])).toBeNull();
  });

  it.each([
    { field: "x", value: Number.NaN },
    { field: "y", value: Number.POSITIVE_INFINITY },
    { field: "width", value: -1 },
    { field: "opacity", value: 101 },
    { field: "locked", value: "true" },
    { field: "version", value: 1.5 },
    { field: "strokeColor", value: "url(javascript:alert(1))" },
  ])("rejects malformed $field rather than claiming it is a native element", ({ field, value }) => {
    expect(boardSceneSchema.safeParse(sceneInput([{ ...rectangle("box"), [field]: value }])).success).toBe(false);
  });

  it("rejects unknown scene versions, editor app state and unowned media payloads", () => {
    expect(boardSceneSchema.safeParse({ ...scene([]), version: 2 }).success).toBe(false);
    expect(boardSceneSchema.safeParse({ ...scene([]), files: { screenshot: { dataURL: "data:image/png;base64,AAAA" } } }).success).toBe(false);
    const appState = { ...scene([]).appState, collaborators: { someone: { username: "Unexpected" } } };
    expect(boardSceneSchema.safeParse({ ...scene([]), appState }).success).toBe(false);
    expect(boardSceneSchema.safeParse({ ...scene([]), appState: { ...scene([]).appState, zoom: { value: 0 } } }).success).toBe(false);
    for (const type of ["image", "iframe", "magicframe", "selection"]) {
      expect(boardSceneSchema.safeParse({ ...scene([]), elements: [{ ...rectangle("unsupported"), type }] }).success).toBe(false);
    }
  });

  it("permits multiple card aliases while rejecting duplicate native element identities", () => {
    const aliases = scene([embed("original"), embed("second-view", "note", { x: 700 })]);
    expect(boardSceneSchema.safeParse(aliases).success).toBe(true);
    expect(boardSceneSchema.safeParse(scene([embed("same-id"), embed("same-id")])).success).toBe(false);
    expect(pruneAvailableRefs(aliases, new Set()).elements).toEqual([]);
  });

  it("rejects embedded content and unvalidated custom metadata", () => {
    const note = embed("note");
    for (const extra of [{ body: "copied private note content" }, { title: "cached source title" }, { html: "<iframe />" }]) {
      expect(boardSceneSchema.safeParse({ ...scene([]), elements: [{ ...note, ...extra }] }).success).toBe(false);
      expect(boardSceneSchema.safeParse(sceneInput([{ ...note, customData: { ...note.customData, ...extra } }])).success).toBe(false);
    }
    expect(boardSceneSchema.safeParse(sceneInput([{ ...rectangle("box"), customData: { studyRef: { kind: "note", id: NOTE_ID } } }])).success).toBe(false);
    expect(sceneReferenceSchema.safeParse({ kind: "note", id: "not-a-uuid" }).success).toBe(false);
    expect(getSceneReference({ type: "embeddable", customData: { studyRef: { kind: "file", id: NOTE_ID } } })).toBeNull();
    expect(getSceneReference({ type: "embeddable", customData: { studyRef: { kind: "note", id: NOTE_ID, body: "copied content" } } })).toBeNull();
  });

  it.each([
    "javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "file:///tmp/note",
    "vbscript:msgbox(1)", "//example.com/path", "/notes/local", "https://example.com/has a space",
    "https://example.com/\nscript", "https://username:password@example.com/path",
  ])("rejects unsafe or unsupported drawing link %s", (link) => {
    expect(boardSceneSchema.safeParse(scene([rectangle("link", { link })])).success).toBe(false);
  });

  it.each(["http://example.com/paper", "https://example.com/paper?q=revision#section"]) ("keeps an explicit external hyperlink %s on a drawing", (link) => {
    expect(sanitizeBoardScene(scene([rectangle("link", { link })])).elements[0].link).toBe(link);
  });

  it("requires canonical card links to match their owned reference exactly", () => {
    expect(boardSceneSchema.safeParse(scene([embed("note", "note", { link: null })])).success).toBe(true);
    expect(boardSceneSchema.safeParse(scene([embed("topic", "topic", { link: `/study-map?topic=${TOPIC_ID}` })])).success).toBe(true);
    for (const link of [`/notes/${TOPIC_ID}`, `/notes/${NOTE_ID}?anything=1`, `/notes/${NOTE_ID}#section`, "https://example.com/iframe"]) {
      expect(boardSceneSchema.safeParse(scene([embed("note", "note", { link })])).success).toBe(false);
    }
    for (const link of [
      `/study-map?topic=${NOTE_ID}`, `/study-map?topic=${TOPIC_ID}&topic=${TOPIC_ID}`,
      `/study-map?topic=${TOPIC_ID}&map=invalid`, `/study-map?topic=${TOPIC_ID}&embed=https://example.com`,
      `/study-map?topic=${TOPIC_ID}#content`,
    ]) {
      expect(boardSceneSchema.safeParse(scene([embed("topic", "topic", { link })])).success).toBe(false);
    }
  });

  it("validates pressure samples and arrow tip fields while allowing simulated pressure", () => {
    expect(boardSceneSchema.safeParse(scene([freehand("ink")])).success).toBe(true);
    expect(boardSceneSchema.safeParse(scene([freehand("simulated", { pressures: [], simulatePressure: true })])).success).toBe(true);
    expect(boardSceneSchema.safeParse(scene([freehand("mismatch", { pressures: [0.5] })])).success).toBe(false);
    expect(boardSceneSchema.safeParse(scene([freehand("pressure", { pressures: [0.5, 1.1, 0.5] })])).success).toBe(false);
    expect(boardSceneSchema.safeParse(sceneInput([{ ...arrow("tip"), endArrowhead: "unsupported" }])).success).toBe(false);
    expect(boardSceneSchema.safeParse(scene([{ ...line("line"), startArrowhead: "crowfoot_many", endArrowhead: "bar" }])).success).toBe(true);
  });

  it("bounds the whole drawing's point and element counts without dropping strokes", () => {
    const points = Array.from({ length: 10_000 }, (_, index): [number, number] => [index, index % 100]);
    const within = scene([freehand("first", { points, pressures: [] }), freehand("second", { points, pressures: [] })]);
    expect(boardSceneSchema.safeParse(within).success).toBe(true);
    const beyond = scene([within.elements[0], freehand("second", { points: [...points, [10_001, 0]], pressures: [] })]);
    expect(boardSceneSchema.safeParse(beyond).success).toBe(false);
    expect(boardSceneSchema.safeParse(scene(Array.from({ length: 2_001 }, (_, index) => rectangle(`shape-${index}`)))).success).toBe(false);
  });

  it("keeps the standard browser font and rejects server-only or unknown font families", () => {
    expect(boardSceneSchema.safeParse(scene([text("standard")])).success).toBe(true);
    for (const fontFamily of [9, 100]) {
      expect(boardSceneSchema.safeParse(sceneInput([{ ...text("unavailable-font"), fontFamily }])).success).toBe(false);
    }
  });

  it("enforces the save limit in UTF-8 bytes rather than character count", () => {
    const annotation = "😀".repeat(10_000);
    const elements = Array.from({ length: 26 }, (_, index) => text(`annotation-${index}`, { text: annotation, originalText: annotation }));
    expect(boardSceneSchema.safeParse(scene(elements.slice(0, 20))).success).toBe(true);
    const oversized = scene(elements);
    expect(JSON.stringify(oversized).length).toBeLessThan(2_000_000);
    const result = boardSceneSchema.safeParse(oversized);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.message.includes("2 MB"))).toBe(true);
  });
});

describe("board scene pruning", () => {
  it("preserves valid relationships, pins, viewport and object identity when references remain available", () => {
    const valid = scene([
      frame("frame"),
      rectangle("box", { locked: true, frameId: "frame", boundElements: [{ id: "label", type: "text" }, { id: "arrow", type: "arrow" }] }),
      text("label", { containerId: "box" }),
      arrow("arrow", { startBinding: { elementId: "box", focus: 0, gap: 4 }, endBinding: { elementId: "note", focus: 0.5, gap: 4 } }),
      embed("note", "note", { boundElements: [{ id: "arrow", type: "arrow" }] }),
    ]);
    expect(boardSceneSchema.safeParse(valid).success).toBe(true);
    expect(pruneAvailableRefs(valid, new Set([`note:${NOTE_ID}`]))).toBe(valid);
    expect(sanitizeBoardScene(valid)).toEqual(valid);
  });

  it("removes unavailable source aliases and detaches arrows while preserving annotations", () => {
    const annotation = text("annotation");
    const before = scene([
      embed("note"), embed("note-alias", "note", { isDeleted: true }), embed("topic", "topic"), annotation,
      arrow("arrow", { startBinding: { elementId: "note", focus: 0, gap: 4 } }),
    ]);
    const after = pruneAvailableRefs(before, new Set([`topic:${TOPIC_ID}`]));

    expect(after.elements.map((element) => element.id)).toEqual(["topic", "annotation", "arrow"]);
    expect(after.elements[1]).toBe(annotation);
    expect(after.elements[2]).toMatchObject({ startBinding: null, points: [[0, 0], [120, 80]] });
    expect(after.appState).toBe(before.appState);
  });

  it("keeps available canonical tombstones so refresh cannot resurrect a removed card", () => {
    const deletedCard = embed("deleted-card", "note", { isDeleted: true });
    const deletedDrawing = rectangle("deleted-drawing", { isDeleted: true });
    const before = scene([deletedCard, deletedDrawing]);

    expect(sanitizeBoardScene(before)).toEqual(before);
    expect(pruneAvailableRefs(before, new Set([`note:${NOTE_ID}`]))).toBe(before);
    expect(pruneAvailableRefs(before, new Set()).elements).toEqual([deletedDrawing]);
  });

  it("repairs self-referential and cyclic frames while keeping valid nested frame membership", () => {
    const before = scene([
      frame("cycle-a", { frameId: "cycle-b" }), frame("cycle-b", { frameId: "cycle-a" }),
      frame("self", { frameId: "self" }), rectangle("cycle-child", { frameId: "cycle-a" }),
      frame("outer"), frame("inner", { frameId: "outer" }), rectangle("valid-child", { frameId: "inner" }),
    ]);
    const after = sanitizeBoardScene(before);

    expect(after.elements.slice(0, 4).map((element) => element.frameId)).toEqual([null, null, null, null]);
    expect(after.elements.slice(4).map((element) => element.frameId)).toEqual([null, "outer", "inner"]);
    expect(after.elements.map((element) => element.id)).toEqual(before.elements.map((element) => element.id));
  });

  it("does not use deleted frames, line or freehand elements as live binding targets", () => {
    const before = scene([
      frame("deleted-frame", { isDeleted: true }), rectangle("child", { frameId: "deleted-frame" }),
      freehand("ink"), line("line"), text("label", { containerId: "ink" }),
      arrow("arrow", { startBinding: { elementId: "line", focus: 0, gap: 4 }, endBinding: { elementId: "arrow", focus: 0, gap: 4 } }),
    ]);
    const after = sanitizeBoardScene(before);

    expect(after.elements[1].frameId).toBeNull();
    expect(after.elements[4]).toMatchObject({ type: "text", containerId: null, text: "My drawing annotation" });
    expect(after.elements[5]).toMatchObject({ type: "arrow", startBinding: null, endBinding: null });
    expect(after.elements).toHaveLength(6);
  });

  it("repairs missing containers and nonreciprocal bound elements instead of dropping drawings", () => {
    const before = scene([
      rectangle("box", { boundElements: [{ id: "missing", type: "arrow" }, { id: "label", type: "text" }, { id: "other", type: "arrow" }] }),
      text("label", { containerId: "unavailable" }), arrow("other"),
    ]);
    const after = sanitizeBoardScene(before);

    expect(after.elements[0].boundElements).toEqual([]);
    expect(after.elements[1]).toMatchObject({ containerId: null, text: "My drawing annotation" });
    expect(after.elements.map((element) => element.id)).toEqual(["box", "label", "other"]);
  });
});
