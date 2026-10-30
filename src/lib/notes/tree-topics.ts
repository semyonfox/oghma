import type { CourseState, TopicMark } from "@/lib/notes/types/note";
import { topicColour } from "@/lib/study-map/topic-colours";
import type {
  MaterialOverrides,
  Relevance,
  TopicAssociation,
} from "@/lib/study-map/types";

/** what the user has said about each topic on one file in one map */
export type TopicChoices = Record<string, Relevance | "excluded">;

export interface TopicName {
  id: string;
  name: string;
}

interface MaterialTopicsInput {
  mapId: string;
  topics: readonly TopicName[];
  mapTaxonomyVersion: number;
  materialTaxonomyVersion: number;
  associations: readonly TopicAssociation[];
  overrides: MaterialOverrides;
}

/**
 * The marks one material shows in the tree. Confirmed means accepted by the
 * classifier or chosen by the user. Suggestions and corrections made against
 * an older topic list are shown hollow, for review. The tree can't afford the
 * source hash check, so a correction only goes stale here when the topic list
 * changes. The tag popover uses the full check.
 */
export function summariseMaterialTopics(input: MaterialTopicsInput): TopicMark[] {
  const order = new Map(input.topics.map((topic, index) => [topic.id, index]));
  const names = new Map(input.topics.map((topic) => [topic.id, topic.name]));
  const classificationCurrent =
    input.materialTaxonomyVersion === input.mapTaxonomyVersion;
  const overridesCurrent =
    input.overrides.taxonomyVersion === input.mapTaxonomyVersion;
  const marks = new Map<string, { relevance: Relevance; suggested: boolean }>();

  for (const association of input.associations) {
    if (!order.has(association.topicId) || association.status === "rejected") continue;
    marks.set(association.topicId, {
      relevance: association.relevance,
      suggested: association.status === "suggested" || !classificationCurrent,
    });
  }
  for (const [topicId, choice] of Object.entries(input.overrides.topics)) {
    if (!order.has(topicId)) continue;
    if (overridesCurrent) {
      if (choice === "excluded") marks.delete(topicId);
      else marks.set(topicId, { relevance: choice, suggested: false });
    } else if (choice !== "excluded" && marks.get(topicId)?.suggested !== false) {
      marks.set(topicId, { relevance: choice, suggested: true });
    }
  }
  for (const [topicId, relevance] of Object.entries(input.overrides.unreviewed ?? {})) {
    if (order.has(topicId) && marks.get(topicId)?.suggested !== false) {
      marks.set(topicId, { relevance, suggested: true });
    }
  }

  const entries = [...marks].sort(
    ([left], [right]) => (order.get(left) ?? 0) - (order.get(right) ?? 0),
  );
  const mainId =
    entries.find(([, mark]) => !mark.suggested && mark.relevance === "core")?.[0] ??
    entries.find(([, mark]) => mark.relevance === "core")?.[0] ??
    null;
  return entries.map(([topicId, mark]) => ({
    mapId: input.mapId,
    topicId,
    name: names.get(topicId) ?? "",
    topicIndex: order.get(topicId) ?? 0,
    main: topicId === mainId,
    suggested: mark.suggested,
  }));
}

/** main topic first, then confirmed, then suggestions, keeping each map's topic order */
export function orderTopicMarks(marks: readonly TopicMark[]): TopicMark[] {
  const mapOrder = new Map<string, number>();
  for (const mark of marks) if (!mapOrder.has(mark.mapId)) mapOrder.set(mark.mapId, mapOrder.size);
  const rank = (mark: TopicMark) => (mark.main && !mark.suggested ? 0 : mark.suggested ? 2 : 1);
  return [...marks].sort(
    (left, right) =>
      rank(left) - rank(right) ||
      (mapOrder.get(left.mapId) ?? 0) - (mapOrder.get(right.mapId) ?? 0) ||
      left.topicIndex - right.topicIndex,
  );
}

// D1: dots share one fixed slot so file names never shift between rows
export const MAX_TOPIC_DOTS = 5;
export const TOPIC_SLOT_PX = 27;
export const TOPIC_DOT_PX = 7;
/** the ring cut out of a dot where the next one overlaps it */
export const TOPIC_CUTOUT_PX = 1.5;

/**
 * The dots a row shows. When the list is cut to five, the last slot goes to
 * the first suggestion so a hollow ring still says something waits for review.
 */
export function visibleTopicMarks(marks: readonly TopicMark[]): TopicMark[] {
  const shown = marks.slice(0, MAX_TOPIC_DOTS);
  const pending = marks.find((mark) => mark.suggested);
  if (!pending || shown.includes(pending)) return shown;
  return [...shown.slice(0, MAX_TOPIC_DOTS - 1), pending];
}

/** space between neighbouring dots. up to three sit 3px apart, four or five overlap to fit the slot */
export function topicDotGap(count: number): number {
  if (count <= 3) return 3;
  return (TOPIC_SLOT_PX - TOPIC_DOT_PX * count) / (count - 1);
}

/** a topic's mark uses its map colour, filled when confirmed and hollow when waiting for review */
export function topicMarkColour(mark: TopicMark): string {
  return topicColour(mark.topicIndex);
}

// popover rules

/** keep one main topic: the first core one in map order, the rest become "also" */
export function normaliseMain(
  choices: TopicChoices,
  topicOrder: readonly string[],
): TopicChoices {
  const cores = topicOrder.filter((id) => choices[id] === "core");
  if (cores.length <= 1) return choices;
  const next = { ...choices };
  for (const id of cores.slice(1)) next[id] = "supporting";
  return next;
}

/** tick a topic. choosing a new main demotes the old one, since a file has one main per map */
export function chooseTopic(
  choices: TopicChoices,
  topicId: string,
  relevance: Relevance,
): TopicChoices {
  const next: TopicChoices = {};
  for (const [id, choice] of Object.entries(choices)) {
    next[id] = relevance === "core" && choice === "core" ? "supporting" : choice;
  }
  next[topicId] = relevance;
  return next;
}

/** untick a topic. it's stored as excluded so the classifier can't put it back */
export function untickTopic(choices: TopicChoices, topicId: string): TopicChoices {
  return { ...choices, [topicId]: "excluded" };
}

/** keep a suggestion. it only becomes main when the file has no main yet */
export function keepSuggestion(
  choices: TopicChoices,
  topicId: string,
  suggested: Relevance,
): TopicChoices {
  const hasMain = Object.entries(choices).some(
    ([id, choice]) => id !== topicId && choice === "core",
  );
  return { ...choices, [topicId]: suggested === "core" && !hasMain ? "core" : "supporting" };
}

/** move between topics in one write: the old one is excluded and the new one takes its place */
export function moveToTopic(
  choices: TopicChoices,
  fromTopicId: string,
  toTopicId: string,
): TopicChoices {
  if (fromTopicId === toTopicId) return choices;
  const relevance: Relevance = choices[fromTopicId] === "core" ? "core" : "supporting";
  return chooseTopic(untickTopic(choices, fromTopicId), toTopicId, relevance);
}

/** the starting point for editing: current corrections plus what the classifier already accepted */
export function confirmedChoices(
  associations: readonly TopicAssociation[],
  overrides: TopicChoices,
  overridesCurrent: boolean,
): TopicChoices {
  const choices: TopicChoices = overridesCurrent ? { ...overrides } : {};
  for (const association of associations) {
    if (association.status === "accepted" && choices[association.topicId] === undefined) {
      choices[association.topicId] = association.relevance;
    }
  }
  return choices;
}

export function isTicked(choice: TopicChoices[string] | undefined): boolean {
  return choice === "core" || choice === "supporting";
}

export type BulkState = "on" | "off" | "mixed";

/** tri-state checkbox for one topic across several files */
export function bulkTopicState(
  files: readonly TopicChoices[],
  topicId: string,
): { state: BulkState; count: number; total: number } {
  const count = files.filter((choices) => isTicked(choices[topicId])).length;
  const total = files.length;
  return {
    state: count === 0 ? "off" : count === total ? "on" : "mixed",
    count,
    total,
  };
}

/** a mixed or empty box adds the topic to every file, a full one removes it from all */
export function applyBulkToggle(
  files: readonly TopicChoices[],
  topicId: string,
): TopicChoices[] {
  const { state } = bulkTopicState(files, topicId);
  return files.map((choices) => {
    if (state === "on") return untickTopic(choices, topicId);
    return isTicked(choices[topicId]) ? choices : { ...choices, [topicId]: "supporting" };
  });
}

// finished courses

export function isFinishedCourse(course: CourseState | undefined): boolean {
  if (!course) return false;
  if (course.override !== null) return course.override;
  return course.canvasStatus === "past";
}

/**
 * The override to save when the user flips a folder. Matching what canvas
 * already says clears it, so a later canvas change still takes effect.
 */
export function nextFinishedOverride(course: CourseState): boolean | null {
  const finished = !isFinishedCourse(course);
  const canvasSays = course.canvasStatus === "past";
  return course.isCanvasCourse && finished === canvasSays ? null : finished;
}

export interface FoldedCourses {
  visible: string[];
  hidden: string[];
}

/**
 * Split top-level ids into the ones shown and the finished ones folded into
 * the footer row. A course stays in place while the open note is inside it.
 */
export function foldFinishedCourses(
  rootChildren: readonly string[],
  courseOf: (id: string) => CourseState | undefined,
  options: { hide: boolean; keepIds?: ReadonlySet<string> },
): FoldedCourses {
  if (!options.hide) return { visible: [...rootChildren], hidden: [] };
  const visible: string[] = [];
  const hidden: string[] = [];
  for (const id of rootChildren) {
    if (isFinishedCourse(courseOf(id)) && !options.keepIds?.has(id)) hidden.push(id);
    else visible.push(id);
  }
  return { visible, hidden };
}
