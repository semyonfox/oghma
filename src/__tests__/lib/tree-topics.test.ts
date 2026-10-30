import { describe, expect, it } from "vitest";
import {
  applyBulkToggle,
  bulkTopicState,
  chooseTopic,
  foldFinishedCourses,
  isFinishedCourse,
  keepSuggestion,
  moveToTopic,
  nextFinishedOverride,
  normaliseMain,
  orderTopicMarks,
  summariseMaterialTopics,
  topicDotGap,
  visibleTopicMarks,
  untickTopic,
  type TopicChoices,
} from "@/lib/notes/tree-topics";
import { topicEditFor } from "@/lib/notes/tag-editing";
import type { CourseState } from "@/lib/notes/types/note";
import type { TopicAssociation } from "@/lib/study-map/types";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const topics = [
  { id: A, name: "Scheduling" },
  { id: B, name: "Processes" },
  { id: C, name: "Memory" },
];

function association(topicId: string, overrides: Partial<TopicAssociation> = {}): TopicAssociation {
  return {
    topicId,
    relevance: "supporting",
    probability: 0.8,
    evidence: [],
    status: "accepted",
    origin: "automatic",
    ...overrides,
  };
}

describe("one main topic per file per map", () => {
  it("demotes the old main when a new one is chosen", () => {
    expect(chooseTopic({ [A]: "core", [B]: "supporting" }, B, "core")).toEqual({
      [A]: "supporting",
      [B]: "core",
    });
  });

  it("leaves the main alone when another topic is ticked as also", () => {
    expect(chooseTopic({ [A]: "core" }, C, "supporting")).toEqual({ [A]: "core", [C]: "supporting" });
  });

  it("keeps the first core topic in map order when a file arrives with two", () => {
    expect(normaliseMain({ [C]: "core", [A]: "core" }, [A, B, C])).toEqual({
      [A]: "core",
      [C]: "supporting",
    });
  });

  it("keeps a suggested core topic as also when the file already has a main", () => {
    expect(keepSuggestion({ [A]: "core" }, B, "core")).toEqual({ [A]: "core", [B]: "supporting" });
    expect(keepSuggestion({}, B, "core")).toEqual({ [B]: "core" });
  });

  it("stores an unticked topic as excluded so the classifier can't bring it back", () => {
    expect(untickTopic({ [A]: "core" }, A)).toEqual({ [A]: "excluded" });
  });

  it("moves between topics in one change and carries the main over", () => {
    expect(moveToTopic({ [A]: "core", [B]: "supporting" }, A, C)).toEqual({
      [A]: "excluded",
      [B]: "supporting",
      [C]: "core",
    });
  });
});

describe("tri-state bulk topics", () => {
  const files: TopicChoices[] = [{ [A]: "core" }, { [A]: "supporting" }, { [B]: "core" }];

  it("counts how many of the selection have a topic", () => {
    expect(bulkTopicState(files, A)).toEqual({ state: "mixed", count: 2, total: 3 });
    expect(bulkTopicState(files, C)).toEqual({ state: "off", count: 0, total: 3 });
    expect(bulkTopicState([{ [A]: "core" }, { [A]: "supporting" }], A).state).toBe("on");
  });

  it("treats an excluded topic as unticked", () => {
    expect(bulkTopicState([{ [A]: "excluded" }, { [A]: "core" }], A)).toEqual({
      state: "mixed",
      count: 1,
      total: 2,
    });
  });

  it("adds a mixed topic to every file, keeping the ones that already have it", () => {
    const next = applyBulkToggle(files, A);
    expect(next).toEqual([{ [A]: "core" }, { [A]: "supporting" }, { [B]: "core", [A]: "supporting" }]);
    expect(next[0]).toBe(files[0]);
    expect(bulkTopicState(next, A).state).toBe("on");
  });

  it("removes a full topic from every file on the second click", () => {
    const added = applyBulkToggle(files, A);
    expect(applyBulkToggle(added, A).map((choices) => choices[A])).toEqual([
      "excluded",
      "excluded",
      "excluded",
    ]);
  });
});

describe("summariseMaterialTopics", () => {
  const base = {
    mapId: "map",
    topics,
    mapTaxonomyVersion: 3,
    materialTaxonomyVersion: 3,
    overrides: { topics: {}, sourceHash: "", taxonomyVersion: 0 },
  };

  it("marks accepted topics as confirmed and suggestions as hollow, with one main", () => {
    const marks = summariseMaterialTopics({
      ...base,
      associations: [
        association(C, { relevance: "core" }),
        association(A, { relevance: "core" }),
        association(B, { status: "suggested" }),
      ],
    });
    expect(marks.map(({ name, main, suggested }) => ({ name, main, suggested }))).toEqual([
      { name: "Scheduling", main: true, suggested: false },
      { name: "Processes", main: false, suggested: true },
      { name: "Memory", main: false, suggested: false },
    ]);
  });

  it("drops rejected topics and current exclusions", () => {
    const marks = summariseMaterialTopics({
      ...base,
      associations: [association(A, { status: "rejected" }), association(B)],
      overrides: { topics: { [B]: "excluded", [C]: "core" }, sourceHash: "x", taxonomyVersion: 3 },
    });
    expect(marks.map((mark) => [mark.name, mark.main, mark.suggested])).toEqual([["Memory", true, false]]);
  });

  it("shows corrections made against an older topic list as suggestions for review", () => {
    const marks = summariseMaterialTopics({
      ...base,
      associations: [],
      overrides: { topics: { [B]: "core" }, sourceHash: "x", taxonomyVersion: 2 },
    });
    expect(marks).toEqual([
      { mapId: "map", topicId: B, name: "Processes", topicIndex: 1, main: true, suggested: true },
    ]);
  });

  it("keeps stale picks carried past a later save hollow next to the current ones", () => {
    const marks = summariseMaterialTopics({
      ...base,
      associations: [],
      overrides: { topics: { [A]: "supporting" }, unreviewed: { [B]: "core" }, sourceHash: "x", taxonomyVersion: 3 },
    });
    expect(marks.map((mark) => [mark.name, mark.suggested])).toEqual([
      ["Scheduling", false],
      ["Processes", true],
    ]);
  });

  it("treats a classification from an older topic list as unconfirmed", () => {
    const marks = summariseMaterialTopics({
      ...base,
      materialTaxonomyVersion: 2,
      associations: [association(A)],
    });
    expect(marks[0].suggested).toBe(true);
  });

  it("orders the main topic first, then confirmed, then suggestions", () => {
    const marks = orderTopicMarks([
      { mapId: "m", topicId: A, name: "a", topicIndex: 0, main: false, suggested: true },
      { mapId: "m", topicId: B, name: "b", topicIndex: 1, main: false, suggested: false },
      { mapId: "m", topicId: C, name: "c", topicIndex: 2, main: true, suggested: false },
    ]);
    expect(marks.map((mark) => mark.name)).toEqual(["c", "b", "a"]);
  });
});

describe("finished courses", () => {
  const course = (overrides: Partial<CourseState>): CourseState => ({
    canvasStatus: null,
    isCanvasCourse: true,
    override: null,
    academicYear: null,
    ...overrides,
  });

  it("follows canvas unless the user has said otherwise", () => {
    expect(isFinishedCourse(course({ canvasStatus: "past" }))).toBe(true);
    expect(isFinishedCourse(course({ canvasStatus: "current" }))).toBe(false);
    expect(isFinishedCourse(course({ canvasStatus: "past", override: false }))).toBe(false);
    expect(isFinishedCourse(course({ isCanvasCourse: false, override: true }))).toBe(true);
  });

  it("counts an unknown status as active", () => {
    expect(isFinishedCourse(course({}))).toBe(false);
    expect(isFinishedCourse(undefined)).toBe(false);
  });

  it("clears the override when it would match canvas", () => {
    expect(nextFinishedOverride(course({ canvasStatus: "past" }))).toBe(false);
    expect(nextFinishedOverride(course({ canvasStatus: "past", override: false }))).toBeNull();
    expect(nextFinishedOverride(course({ isCanvasCourse: false }))).toBe(true);
    expect(nextFinishedOverride(course({ isCanvasCourse: false, override: true }))).toBe(false);
  });

  it("folds finished courses away and keeps the one holding the open note", () => {
    const courses: Record<string, CourseState> = {
      ct213: course({ canvasStatus: "current" }),
      ct101: course({ canvasStatus: "past" }),
      ct102: course({ canvasStatus: "past" }),
      compsoc: course({ isCanvasCourse: false }),
    };
    const ids = ["ct213", "ct101", "ct102", "compsoc", "loose-note"];
    expect(foldFinishedCourses(ids, (id) => courses[id], { hide: true, keepIds: new Set(["ct102"]) })).toEqual({
      visible: ["ct213", "ct102", "compsoc", "loose-note"],
      hidden: ["ct101"],
    });
  });

  it("shows everything when hiding is off", () => {
    const fold = foldFinishedCourses(["a"], () => course({ canvasStatus: "past" }), { hide: false });
    expect(fold).toEqual({ visible: ["a"], hidden: [] });
  });
});

describe("topic colours", () => {
  it("cycles the eight shared hues so the tree matches the map", async () => {
    const { topicColour } = await import("@/lib/study-map/topic-colours");
    expect(topicColour(0)).toBe("var(--color-topic-0)");
    expect(topicColour(9)).toBe("var(--color-topic-1)");
  });
});

describe("topicEditFor", () => {
  it("offers stale picks carried past a later save for review, not as ticked", () => {
    const edit = topicEditFor({
      mapId: "00000000-0000-4000-8000-0000000000ff",
      mapName: "CT213",
      topics,
      taxonomyVersion: 3,
      material: {
        noteId: "00000000-0000-4000-8000-0000000000ee",
        associations: [],
        overrides: { topics: { [A]: "supporting" }, unreviewed: { [B]: "core" }, sourceHash: "h", taxonomyVersion: 3 },
        status: "unclassified",
        sourceHash: "",
        currentHash: "h",
        taxonomyVersion: 0,
      },
    });
    expect(edit.choices).toEqual({ [A]: "supporting" });
    expect(edit.suggestions).toEqual({ [B]: "core" });
  });
});

describe("D1 dot slot", () => {
  it("keeps up to three dots 3px apart and overlaps four or five inside the same 27px", () => {
    expect([1, 2, 3].map(topicDotGap)).toEqual([3, 3, 3]);
    for (const count of [3, 4, 5]) {
      expect(7 * count + topicDotGap(count) * (count - 1)).toBeCloseTo(27);
    }
    expect(topicDotGap(5)).toBe(-2);
  });
});

describe("visibleTopicMarks", () => {
  const mark = (index: number, suggested: boolean) => ({
    mapId: "m",
    topicId: `t${index}`,
    name: `t${index}`,
    topicIndex: index,
    main: index === 0,
    suggested,
  });

  it("gives the last of five slots to a suggestion the cut would hide", () => {
    const marks = [0, 1, 2, 3, 4, 5].map((index) => mark(index, false)).concat([mark(6, true), mark(7, true)]);
    expect(visibleTopicMarks(marks).map((entry) => entry.topicId)).toEqual(["t0", "t1", "t2", "t3", "t6"]);
  });

  it("leaves five or fewer alone", () => {
    const marks = [mark(0, false), mark(1, true)];
    expect(visibleTopicMarks(marks)).toEqual(marks);
  });
});
