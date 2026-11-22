import { DECK_MODULE_GAP, layoutDecks, type DeckTable } from "@/lib/study-map/decks";
import { summariseExamCorpus } from "@/lib/study-map/exam-stats";
import {
  assignmentSources,
  CARD_WIDTH,
  CLUSTER_HEADER,
  flowLinks,
  layoutModule,
  MODULE_GAP,
  moduleItems,
  topicBridges,
  type FlowCluster,
  type FlowItem,
  type FlowLink,
  type ModuleLayout,
  type TopicBridge,
} from "@/lib/study-map/flow";
import { topicColour } from "@/lib/study-map/topic-colours";
import type { StudyBoard, StudyMapSnapshot } from "@/lib/study-map/types";
import { readableExcerpt } from "./study-board-card";

import type { ColouredTopic, PlacedItem } from "./study-flow-panels";

export interface FlowModule {
  snapshot: StudyMapSnapshot;
  board: StudyBoard;
}

// below this the board is a table of topic decks, in its own coordinates. crossing it keeps the same topic under the pointer
export const DECK_ZOOM = 0.5;
// zooming in past DECK_ZOOM parks the camera and spends this much log-zoom unfolding the decks into clusters where they sit
export const UNFOLD_LOG = Math.log(1.8);
export const COMPACT_ZOOM = 0.72;
export const MIN_ZOOM = 0.06;
export const MAX_ZOOM = 1.8;
export const CULL_THRESHOLD = 260;
// the floating islands cover this much of the top of the board
export const TOP_INSET = 56;
export const LINK_LABELS = [
  "builds on",
  "example of",
  "contrasts with",
  "same idea",
  "needed for",
];
export const toolbarButton =
  "inline-flex min-h-7 items-center whitespace-nowrap rounded-radius-md px-2 text-xs font-medium text-text-secondary hover:bg-subtle-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent";
export const iconButton =
  "grid h-8 w-8 place-items-center rounded-radius-md text-text-secondary hover:bg-subtle-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent";

export type Camera = { x: number; y: number; z: number };
export type Rect = { x: number; y: number; w: number; h: number };
/**
 * decks part way to clusters. off moves the cluster layout so the pointed topic opens where its deck was, and the
 * camera eases from DECK_ZOOM to full so that topic keeps roughly its size on screen
 */
export type Unfold = {
  u: number;
  key: string;
  off: { x: number; y: number };
  full: number;
};
export type FilterKey =
  | "lectures"
  | "slides"
  | "worked"
  | "readings"
  | "files"
  | "mine"
  | "assignments";
export const FILTERS: Array<[FilterKey, string]> = [
  ["lectures", "Lectures and notes"],
  ["slides", "Slides and PDFs"],
  ["worked", "Worked examples"],
  ["readings", "Readings"],
  ["files", "Images and files"],
  ["mine", "Your notes"],
  ["assignments", "Assignments"],
];

export interface ModuleModel {
  mapId: string;
  name: string;
  year: string;
  snapshot: StudyMapSnapshot;
  board: StudyBoard;
  items: FlowItem[];
  layout: ModuleLayout;
  topics: ColouredTopic[];
  originY: number;
  syllabusCount: number;
  paperCount: number;
  /** marks per topic across the reviewed papers, sizes the decks */
  examMarks: Map<string, number>;
}

export interface Placed extends PlacedItem {
  module: ModuleModel;
  x: number;
  y: number;
}

export interface Model {
  modules: ModuleModel[];
  byRef: Map<string, Placed>;
  /** topic ID to its cluster, for edges and bridges */
  clusters: Map<string, { module: ModuleModel; cluster: FlowCluster }>;
  ordered: Placed[];
  links: FlowLink[];
  bridges: TopicBridge[];
  topics: Map<string, ColouredTopic>;
  usedBy: Map<string, FlowItem[]>;
  sources: Map<string, FlowItem[]>;
  width: number;
  height: number;
}

export function filterKey(item: FlowItem): FilterKey {
  if (item.kind === "assignment") return "assignments";
  if (item.kind === "pdf") return "slides";
  if (item.kind === "image" || item.kind === "file") return "files";
  const material = item.material!;
  if (!material.imported) return "mine";
  if (material.kind === "slides") return "slides";
  if (material.kind === "worked_example") return "worked";
  if (material.kind === "reading") return "readings";
  return "lectures";
}

export function examCorpus(snapshot: StudyMapSnapshot) {
  const versions = [
    ...new Set(snapshot.papers.map((paper) => paper.structure.syllabusVersion)),
  ];
  if (!versions.length) return null;
  // the module's own academic year is the syllabus most worth comparing against
  const version = versions.includes(snapshot.map.academicYear)
    ? snapshot.map.academicYear
    : versions.sort().at(-1)!;
  const summary = summariseExamCorpus(
    snapshot.papers.filter(
      (paper) => paper.structure.syllabusVersion === version,
    ),
    snapshot.map.topics,
    snapshot.map.taxonomyVersion,
    version,
  );
  return summary.eligibleCount ? { summary, version } : null;
}

export function examLines(
  corpus: ReturnType<typeof examCorpus>,
): Map<string, string> {
  if (!corpus) return new Map();
  const { summary, version } = corpus;
  return new Map(
    summary.topics.map((row) => [
      row.topicId,
      `In ${row.paperCount} of ${summary.eligibleCount} reviewed ${summary.eligibleCount === 1 ? "paper" : "papers"} (${version})`,
    ]),
  );
}

export interface TableModule {
  module: ModuleModel;
  table: DeckTable;
  originY: number;
}

export interface Table {
  modules: TableModule[];
  width: number;
  height: number;
}

export function deckTableFor(models: ModuleModel[], columns: number): Table {
  let originY = 0;
  const modules = models.map((module) => {
    // a deck holds everything confirmed under its topic. a card sits in one cluster, but a topic is a lens
    const clusters = module.layout.clusters.map((cluster) => ({
      ...cluster,
      refs: [
        ...cluster.refs,
        ...module.items
          .filter(
            (item) =>
              module.layout.primary.get(item.ref) !== cluster.key &&
              item.tags.some(
                (tag) => tag.topicId === cluster.key && !tag.suggested,
              ),
          )
          .map((item) => item.ref),
      ],
    }));
    const laid = layoutDecks(clusters, module.examMarks, columns);
    const table = {
      ...laid,
      decks: laid.decks.map((deck) =>
        deck.cluster.topic
          ? deck
          : { ...deck, id: `${module.mapId}:${deck.key}` },
      ),
    };
    const entry = { module, table, originY };
    originY += table.height + DECK_MODULE_GAP;
    return entry;
  });
  return {
    modules,
    width: Math.max(1200, ...modules.map((entry) => entry.table.width)),
    height: Math.max(0, originY - DECK_MODULE_GAP),
  };
}

export function buildModel(modules: FlowModule[]): Model {
  const prepared = modules.map(({ snapshot, board }) => ({
    snapshot,
    board,
    items: moduleItems(snapshot, board),
  }));
  // note links also pull related topics together, so they are worked out before the layout
  const links = flowLinks(
    prepared.map(({ items, board }) => ({ items, board })),
  );
  let originY = 0;
  const models: ModuleModel[] = prepared.map(({ snapshot, board, items }) => {
    const layout = layoutModule(
      snapshot.map.id,
      snapshot.map.topics,
      items,
      board.placements,
      links,
    );
    const corpus = examCorpus(snapshot);
    const exams = examLines(corpus);
    const model: ModuleModel = {
      mapId: snapshot.map.id,
      name: snapshot.map.name,
      year: snapshot.map.academicYear,
      snapshot,
      board,
      items,
      layout,
      topics: snapshot.map.topics.map((topic, index) => ({
        ...topic,
        colour: topicColour(index),
        mapId: snapshot.map.id,
        exam: exams.get(topic.id) ?? null,
      })),
      originY,
      syllabusCount: snapshot.materials.filter(
        (material) => material.kind === "syllabus",
      ).length,
      paperCount: snapshot.materials.filter(
        (material) => material.kind === "past_paper",
      ).length,
      examMarks: new Map(
        corpus?.summary.topics.map((row) => [
          row.topicId,
          row.exclusiveMarks + row.sharedMarks,
        ]) ?? [],
      ),
    };
    originY += layout.height + MODULE_GAP;
    return model;
  });
  const byRef = new Map<string, Placed>();
  for (const module of models) {
    for (const item of module.items) {
      const position = module.layout.positions.get(item.ref);
      if (position)
        byRef.set(item.ref, {
          item,
          module,
          moduleName: module.name,
          x: position.x,
          y: module.originY + position.y,
        });
    }
  }
  // tab order follows modules, then clusters, then the order inside each cluster
  const ordered = models.flatMap((module) =>
    module.layout.clusters.flatMap((cluster) =>
      cluster.refs.flatMap((ref) => byRef.get(ref) ?? []),
    ),
  );
  const clusters: Model["clusters"] = new Map();
  for (const module of models)
    for (const cluster of module.layout.clusters)
      if (cluster.topic) clusters.set(cluster.key, { module, cluster });
  const bridges =
    models.length > 1
      ? topicBridges(
          models.map((module) => ({
            mapId: module.mapId,
            topics: module.topics,
            items: module.items,
          })),
          links,
        )
      : [];
  const usedBy = new Map<string, FlowItem[]>();
  const sources = new Map<string, FlowItem[]>();
  for (const module of models) {
    for (const item of module.items) {
      if (item.kind !== "assignment") continue;
      const list = assignmentSources(item, module.items);
      sources.set(item.ref, list);
      for (const source of list)
        usedBy.set(source.ref, [...(usedBy.get(source.ref) ?? []), item]);
    }
  }
  return {
    modules: models,
    byRef,
    clusters,
    ordered,
    links,
    bridges,
    topics: new Map(
      models.flatMap((module) =>
        module.topics.map((topic) => [topic.id, topic] as const),
      ),
    ),
    usedBy,
    sources,
    width: Math.max(1200, ...models.map((module) => module.layout.width)),
    height: Math.max(0, originY - MODULE_GAP),
  };
}

export function connector(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = bc.x - ac.x;
  const dy = bc.y - ac.y;
  let p1;
  let p2;
  let c1;
  let c2;
  if (Math.abs(dx) / (a.w + b.w) > Math.abs(dy) / (a.h + b.h)) {
    const s = Math.sign(dx) || 1;
    p1 = { x: s > 0 ? a.x + a.w : a.x, y: ac.y };
    p2 = { x: s > 0 ? b.x : b.x + b.w, y: bc.y };
    const k = Math.max(50, Math.abs(p2.x - p1.x) / 2);
    c1 = { x: p1.x + s * k, y: p1.y };
    c2 = { x: p2.x - s * k, y: p2.y };
  } else {
    const s = Math.sign(dy) || 1;
    p1 = { x: ac.x, y: s > 0 ? a.y + a.h : a.y };
    p2 = { x: bc.x, y: s > 0 ? b.y : b.y + b.h };
    const k = Math.max(50, Math.abs(p2.y - p1.y) / 2);
    c1 = { x: p1.x, y: p1.y + s * k };
    c2 = { x: p2.x, y: p2.y - s * k };
  }
  return {
    d: `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`,
    mid: {
      x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8,
      y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8,
    },
  };
}

export function ribbon(points: Array<{ x: number; y: number }>): string {
  let d = `M${points[0].x},${points[0].y}`;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    const mx = (a.x + b.x) / 2;
    d += ` C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
  }
  return d;
}

export const rectOf = (placed: Placed) => ({
  x: placed.x,
  y: placed.y,
  w: CARD_WIDTH,
  h: placed.item.height,
});
export const headerRect = (module: ModuleModel, cluster: FlowCluster) => ({
  x: cluster.x,
  y: module.originY + cluster.y,
  w: cluster.width,
  h: CLUSTER_HEADER,
});
export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
export const smooth = (from: number, to: number, t: number) => {
  const k = clamp((t - from) / (to - from), 0, 1);
  return k * k * (3 - 2 * k);
};
export const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function matchesQuery(
  placed: Placed,
  query: string,
  topics: Map<string, ColouredTopic>,
): boolean {
  if (!query) return true;
  const { item } = placed;
  const haystack = [
    item.title,
    item.material?.excerpt ?? "",
    readableExcerpt(item.assignment?.description ?? ""),
    ...item.tags.map((tag) => topics.get(tag.topicId)?.name ?? ""),
  ]
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query);
}

// large boards only render the cards near the viewport, plus the selection
export function cullToView(
  positioned: Placed[],
  view: { x: number; y: number; z: number; w: number; h: number },
  selected: string | null,
) {
  const margin = 600 / view.z;
  const left = -view.x / view.z - margin;
  const top = -view.y / view.z - margin;
  const right = left + view.w / view.z + margin * 2;
  const bottom = top + view.h / view.z + margin * 2;
  return positioned.filter(
    (placed) =>
      placed.item.ref === selected ||
      (placed.x + CARD_WIDTH > left &&
        placed.x < right &&
        placed.y + placed.item.height > top &&
        placed.y < bottom),
  );
}

export function readSavedCamera(viewKey: string): Camera | null {
  try {
    const raw = window.sessionStorage.getItem(
      `oghma-study-flow-camera-v2:${viewKey}`,
    );
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      value &&
      typeof value === "object" &&
      "x" in value &&
      "y" in value &&
      "z" in value &&
      typeof value.x === "number" &&
      typeof value.y === "number" &&
      typeof value.z === "number"
    ) {
      return {
        x: value.x,
        y: value.y,
        z: clamp(value.z, MIN_ZOOM, MAX_ZOOM),
      };
    }
    return null;
  } catch {
    return null;
  }
}
