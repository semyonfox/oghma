"use client";

import {
  useEffect,
  useEffectEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import {
  AdjustmentsHorizontalIcon,
  ArrowsPointingOutIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  PlusIcon,
  Squares2X2Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import AssignmentDetails from "@/components/assignments/assignment-details";
import {
  DECK_COLUMNS,
  DECK_COLUMNS_NARROW,
  DECK_MODULE_GAP,
  FAN_CARD_HEIGHT,
  FAN_CARD_WIDTH,
  FAN_MAX_CARDS,
  fanPositions,
  layoutDecks,
  type Deck,
  type DeckTable,
} from "@/lib/study-map/decks";
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
  topicTrail,
  type FlowCluster,
  type FlowItem,
  type FlowLink,
  type ModuleLayout,
  type TopicBridge,
} from "@/lib/study-map/flow";
import { topicColour } from "@/lib/study-map/topic-colours";
import type {
  StudyAssignment,
  StudyBoard,
  StudyMapSnapshot,
} from "@/lib/study-map/types";
import { StudyFlowCard, cardLabel, readableExcerpt } from "./study-board-card";
import { NoticeStack, islandButton, islandClass } from "./study-chrome";
import {
  ItemActions,
  ItemBody,
  ItemHeader,
  ItemRelations,
  TrailPanel,
  primarySmall,
  secondarySmall,
  type ColouredTopic,
  type PlacedItem,
} from "./study-flow-panels";

export interface FlowModule {
  snapshot: StudyMapSnapshot;
  board: StudyBoard;
}

export interface StudyFlowProps {
  modules: FlowModule[];
  /** scope key for remembering the camera between visits */
  viewKey: string;
  /** appended to the top-right island after search, filters and tidy */
  actions?: ReactNode;
  /** floats beside the top-right island, such as setup progress */
  status?: ReactNode;
  /** small text beside the zoom controls */
  saveStatus?: ReactNode;
  /** floating messages over the board */
  notices?: ReactNode;
  onBoardChange: (mapId: string, board: StudyBoard) => void;
  onReview: (mapId: string, noteId: string) => void;
  onOpenModule: (mapId: string) => void;
  /** topic outside the loaded modules, offered when following a bridge */
  onShowAllModules?: () => void;
}

// below this the board is a table of topic decks, in its own coordinates. crossing it keeps the same topic under the pointer
const DECK_ZOOM = 0.5;
const COMPACT_ZOOM = 0.72;
const MIN_ZOOM = 0.06;
const MAX_ZOOM = 1.8;
const CULL_THRESHOLD = 260;
// the floating islands cover this much of the top of the board
const TOP_INSET = 56;
const LINK_LABELS = [
  "builds on",
  "example of",
  "contrasts with",
  "same idea",
  "needed for",
];
const toolbarButton =
  "inline-flex min-h-7 items-center whitespace-nowrap rounded-radius-md px-2 text-xs font-medium text-text-secondary hover:bg-primary-500/10 hover:text-text focus-visible:outline-2 focus-visible:outline-primary-500";
const iconButton =
  "grid h-8 w-8 place-items-center rounded-radius-md text-text-secondary hover:bg-primary-500/10 hover:text-text focus-visible:outline-2 focus-visible:outline-primary-500";

type Camera = { x: number; y: number; z: number };
type FilterKey =
  | "lectures"
  | "slides"
  | "worked"
  | "readings"
  | "files"
  | "mine"
  | "assignments";
const FILTERS: Array<[FilterKey, string]> = [
  ["lectures", "Lectures and notes"],
  ["slides", "Slides and PDFs"],
  ["worked", "Worked examples"],
  ["readings", "Readings"],
  ["files", "Images and files"],
  ["mine", "Your notes"],
  ["assignments", "Assignments"],
];

interface ModuleModel {
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

interface Placed extends PlacedItem {
  module: ModuleModel;
  x: number;
  y: number;
}

interface Model {
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

function filterKey(item: FlowItem): FilterKey {
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

function examCorpus(snapshot: StudyMapSnapshot) {
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

function examLines(
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

interface TableModule {
  module: ModuleModel;
  table: DeckTable;
  originY: number;
}

interface Table {
  modules: TableModule[];
  width: number;
  height: number;
}

function deckTableFor(models: ModuleModel[], columns: number): Table {
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

function buildModel(modules: FlowModule[]): Model {
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

function connector(
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

function ribbon(points: Array<{ x: number; y: number }>): string {
  let d = `M${points[0].x},${points[0].y}`;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    const mx = (a.x + b.x) / 2;
    d += ` C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
  }
  return d;
}

const rectOf = (placed: Placed) => ({
  x: placed.x,
  y: placed.y,
  w: CARD_WIDTH,
  h: placed.item.height,
});
const headerRect = (module: ModuleModel, cluster: FlowCluster) => ({
  x: cluster.x,
  y: module.originY + cluster.y,
  w: cluster.width,
  h: CLUSTER_HEADER,
});
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function matchesQuery(
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
function cullToView(
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

function readSavedCamera(viewKey: string): Camera | null {
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

interface CardLayerProps {
  placed: Placed[];
  compact: boolean;
  state: Map<string, string>;
  stops: Map<string, number>;
  focusColour: string | null;
}

function CardLayer({
  placed,
  compact,
  state,
  stops,
  focusColour,
}: CardLayerProps) {
  return (
    <>
      {placed.map(({ item, module, x, y }) => {
        const flags = state.get(item.ref) ?? "";
        const pinned = module.board.placements.some(
          (placement) => placement.id === item.ref && placement.pinned,
        );
        const stop = stops.get(item.ref);
        return (
          <article
            key={item.ref}
            data-card={item.ref}
            tabIndex={0}
            data-week={item.week ?? "none"}
            aria-label={`${item.title || "Untitled"}, ${item.week === null ? "no week" : `week ${item.week}`}, ${module.name}`}
            className={`absolute rounded-radius-lg outline-offset-2 transition-[opacity,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline focus-visible:outline-primary-500 ${flags.includes("selected") ? "outline outline-[1.5px] outline-primary-500/80" : ""} ${flags.includes("related") ? "shadow-[0_0_0_1px_var(--color-primary-300)]" : ""} ${flags.includes("dim") ? "opacity-15" : ""} ${flags.includes("supporting") ? "opacity-60" : ""} ${flags.includes("flash") ? "animate-pulse" : ""}`}
            style={{
              left: x,
              top: y,
              width: CARD_WIDTH,
              height: item.height,
              cursor: pinned ? "default" : "grab",
            }}
          >
            <StudyFlowCard
              item={item}
              compact={compact}
              pinned={pinned}
            />
            {stop !== undefined && (
              <span
                className="absolute -left-2.5 -top-2.5 grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold text-white"
                style={{
                  background: focusColour ?? "var(--color-primary-600)",
                }}
              >
                {stop + 1}
              </span>
            )}
          </article>
        );
      })}
    </>
  );
}

interface DeckLayerProps {
  table: Table;
  topics: Map<string, ColouredTopic>;
  visibleRefs: (deck: Deck) => string[];
  byRef: Map<string, Placed>;
  openKey: string | null;
  selected: string | null;
  lit: Set<string>;
  query: string;
  matches: (ref: string) => boolean;
  lines: Array<{ key: string; d: string; x: number; y: number; label: string }>;
}

/** the far view: every topic is one deck, sized by the exam and thicker with more files */
function DeckLayer({
  table,
  topics,
  visibleRefs,
  byRef,
  openKey,
  selected,
  lit,
  query,
  matches,
  lines,
}: DeckLayerProps) {
  const opened = table.modules.flatMap((entry) =>
    entry.table.decks
      .filter((deck) => deck.id === openKey)
      .map((deck) => ({ deck, originY: entry.originY })),
  )[0];
  const openRefs = opened ? visibleRefs(opened.deck) : [];
  const shownRefs = openRefs.slice(0, FAN_MAX_CARDS);
  const more = openRefs.length - shownRefs.length;
  const slots = opened
    ? fanPositions(
        { x: opened.deck.x, y: opened.originY + opened.deck.y },
        shownRefs.length + (more > 0 ? 1 : 0),
        table.width,
      )
    : [];
  return (
    <div className="study-layer-in">
      {table.modules.flatMap(({ module, table: moduleTable, originY }) =>
        moduleTable.decks.map((deck) => {
          const topic = deck.cluster.topic
            ? topics.get(deck.cluster.topic.id)
            : undefined;
          const refs = visibleRefs(deck);
          const name = topic?.name ?? "Not sorted yet";
          const quiet =
            (openKey !== null && !lit.has(deck.id)) ||
            (query.length > 0 &&
              !name.toLocaleLowerCase().includes(query) &&
              !refs.some(matches));
          const exam =
            deck.share !== null
              ? `${Math.round(deck.share * 100)}%`
              : module.examMarks.size > 0 && topic
                ? "no exam data"
                : null;
          return (
            <div
              key={deck.id}
              role="button"
              tabIndex={0}
              data-deck={deck.id}
              aria-expanded={openKey === deck.id}
              aria-label={`${name}, ${refs.length} ${refs.length === 1 ? "file" : "files"}${deck.share !== null ? `, ${Math.round(deck.share * 100)}% of exam marks` : ""}`}
              className={`study-deck study-deck-${deck.tier} absolute cursor-pointer outline-offset-8 transition-opacity duration-200 focus-visible:outline-8 focus-visible:outline focus-visible:outline-primary-500 ${quiet ? "opacity-20" : ""}`}
              style={
                {
                  left: deck.x,
                  top: originY + deck.y,
                  width: deck.width,
                  height: deck.height,
                  "--deck-colour": topic?.colour ?? "var(--color-text-tertiary)",
                } as CSSProperties
              }
            >
              {deck.layers >= 2 && <i className="study-deck-under study-deck-under-2" />}
              {deck.layers >= 1 && <i className="study-deck-under study-deck-under-1" />}
              <div className="study-deck-face">
                <b>{name}</b>
                <span>
                  {refs.length} {refs.length === 1 ? "file" : "files"}
                </span>
                {exam && (
                  <em>
                    {exam}
                    {deck.share !== null && (
                      <span className="sr-only"> of exam marks</span>
                    )}
                  </em>
                )}
              </div>
            </div>
          );
        }),
      )}
      {lines.length > 0 && (
        <svg
          className="pointer-events-none absolute left-0 top-0 z-10 overflow-visible"
          width={1}
          height={1}
          aria-hidden="true"
        >
          {lines.map((line) => (
            <path
              key={line.key}
              d={line.d}
              fill="none"
              stroke="var(--color-primary-400)"
              strokeWidth={7}
              strokeLinecap="round"
            />
          ))}
        </svg>
      )}
      {lines
        .filter((line) => line.label)
        .map((line) => (
          <div
            key={`${line.key}-label`}
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-background px-5 py-1 font-semibold text-primary-700 dark:text-primary-300"
            style={{ left: line.x, top: line.y, fontSize: 34 }}
          >
            {line.label}
          </div>
        ))}
      {shownRefs.map((ref, index) => {
        const placed = byRef.get(ref);
        if (!placed) return null;
        const slot = slots[index];
        return (
          <div
            key={ref}
            role="button"
            tabIndex={0}
            data-fan={ref}
            aria-pressed={selected === ref}
            aria-label={placed.item.title || "Untitled"}
            className={`study-fan-card absolute z-20 cursor-pointer ${selected === ref ? "study-fan-card-selected" : ""}`}
            style={{
              left: slot.x,
              top: slot.y,
              width: FAN_CARD_WIDTH,
              height: FAN_CARD_HEIGHT,
              transform: `rotate(${slot.rotate}deg)`,
            }}
          >
            <small>{cardLabel(placed.item)}</small>
            <b>{placed.item.title || "Untitled"}</b>
            <p>
              {readableExcerpt(
                (placed.item.material?.excerpt ?? "").replace(
                  /^\s*#\s+[^\n]*\n+/,
                  "",
                ),
              )}
            </p>
          </div>
        );
      })}
      {more > 0 && opened && (
        <div
          role="button"
          tabIndex={0}
          data-deck-all={opened.deck.id}
          className="study-fan-card study-fan-more absolute z-20 cursor-pointer"
          style={{
            left: slots[shownRefs.length].x,
            top: slots[shownRefs.length].y,
            width: FAN_CARD_WIDTH,
            height: FAN_CARD_HEIGHT,
          }}
        >
          <b>+{more} more</b>
          <small>Zoom in to see them all</small>
        </div>
      )}
    </div>
  );
}

export default function StudyFlow({
  modules,
  viewKey,
  actions,
  status,
  saveStatus,
  notices,
  onBoardChange,
  onReview,
  onOpenModule,
  onShowAllModules,
}: StudyFlowProps) {
  // useMemo stays: helpers below receive parts of the model, and the compiler
  // can't prove they don't mutate it, so it would rebuild the layout on every
  // pan frame. A memoised value is immutable to it, which also lets it cache
  // everything derived from the model
  const model = useMemo(() => buildModel(modules), [modules]);
  const [openDeck, setOpenDeck] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const camera = useRef<Camera>({ x: 40, y: 20, z: 0.3 });
  const [view, setView] = useState<Camera & { w: number; h: number }>({
    x: 40,
    y: 20,
    z: 0.3,
    w: 1200,
    h: 800,
  });
  const deckTable = useMemo(
    () =>
      deckTableFor(
        model.modules,
        view.w < 640 ? DECK_COLUMNS_NARROW : DECK_COLUMNS,
      ),
    [model, view.w],
  );
  const frame = useRef(0);
  const animation = useRef(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoverTopic, setHoverTopic] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    ref: string;
    pinned: boolean;
  } | null>(null);
  const previewTimer = useRef(0);
  const leaveTimer = useRef(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [reader, setReader] = useState<string | null>(null);
  const [assignmentOpen, setAssignmentOpen] = useState<StudyAssignment | null>(
    null,
  );
  const [focus, setFocus] = useState<{ topicId: string; stop: number } | null>(
    null,
  );
  const [flash, setFlash] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<FilterKey>>(new Set());
  const [showSuggested, setShowSuggested] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [query, setQuery] = useState("");
  const [connect, setConnect] = useState<{
    from: string;
    to: string | null;
    label: string;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<null | {
    kind: "pan" | "card" | "pinch";
    ref?: string;
    startX: number;
    startY: number;
    camera: Camera;
    origin?: { x: number; y: number };
    moved: boolean;
    distance?: number;
  }>(null);
  const dragPosition = useRef<{ ref: string; x: number; y: number } | null>(
    null,
  );
  const [dragging, setDragging] = useState<{
    ref: string;
    x: number;
    y: number;
  } | null>(null);
  const suppressClick = useRef(false);

  const apply = () => {
    const world = worldRef.current;
    const board = boardRef.current;
    if (!world || !board) return;
    const { x, y, z } = camera.current;
    world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    const spacing = 28 * z < 10 ? 28 * z * 4 : 28 * z;
    board.style.backgroundSize = `${spacing}px ${spacing}px`;
    board.style.backgroundPosition = `${x}px ${y}px`;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      setView({
        ...camera.current,
        w: board.clientWidth,
        h: board.clientHeight,
      });
    });
  };

  // the camera only touches refs and the DOM, so effects call the latest one
  const applyCamera = useEffectEvent(apply);

  // decks and clusters have different coordinates, so crossing the threshold keeps the same topic at the same spot on screen
  const crossWorlds = (
    from: Camera,
    to: Camera,
    px: number,
    py: number,
  ): Camera => {
    const wasDecks = from.z < DECK_ZOOM;
    if (wasDecks === to.z < DECK_ZOOM) return to;
    const anchors = deckTable.modules.flatMap(({ module, table, originY }) =>
      table.decks.map((deck) => ({
        deck: {
          x: deck.x + deck.width / 2,
          y: originY + deck.y + deck.height / 2,
          w: deck.width,
          h: deck.height,
        },
        cluster: {
          x: deck.cluster.x + deck.cluster.width / 2,
          y: module.originY + deck.cluster.y + Math.min(deck.cluster.height / 2, 200),
          // measured from the centre above, so the box is only ever used for containing the pointer
          w: deck.cluster.width,
          h: deck.cluster.height,
          top: module.originY + deck.cluster.y,
        },
      })),
    );
    if (!anchors.length) return to;
    const wx = (px - from.x) / from.z;
    const wy = (py - from.y) / from.z;
    // the topic under the pointer wins. only a pointer in a gap falls back to the closest one
    const under = anchors.find(({ deck, cluster }) =>
      wasDecks
        ? Math.abs(wx - deck.x) <= deck.w / 2 &&
          Math.abs(wy - deck.y) <= deck.h / 2
        : Math.abs(wx - cluster.x) <= cluster.w / 2 &&
          wy >= cluster.top &&
          wy <= cluster.top + cluster.h,
    );
    const distance = (point: { x: number; y: number }) =>
      Math.hypot(point.x - wx, point.y - wy);
    const nearest =
      under ??
      anchors.reduce((best, anchor) =>
        distance(wasDecks ? anchor.deck : anchor.cluster) <
        distance(wasDecks ? best.deck : best.cluster)
          ? anchor
          : best,
      );
    const point = wasDecks ? nearest.cluster : nearest.deck;
    return { x: px - point.x * to.z, y: py - point.y * to.z, z: to.z };
  };

  const flyTo = (target: Camera, ms = 380) => {
    cancelAnimationFrame(animation.current);
    // no sliding between two coordinate systems: the layers cross-fade instead
    const crossing = camera.current.z < DECK_ZOOM !== target.z < DECK_ZOOM;
    if (reducedMotion() || ms === 0 || crossing) {
      camera.current = target;
      apply();
      return;
    }
    const from = { ...camera.current };
    // the first frame's timestamp starts the clock, so nothing impure runs here
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const t = clamp((now - start) / ms, 0, 1);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const z = Math.exp(
        Math.log(from.z) + (Math.log(target.z) - Math.log(from.z)) * ease,
      );
      // interpolate the world point at the screen centre so zooming feels anchored
      const board = boardRef.current;
      const w = board?.clientWidth ?? 1200;
      const h = board?.clientHeight ?? 800;
      const fromCentre = {
        x: (w / 2 - from.x) / from.z,
        y: (h / 2 - from.y) / from.z,
      };
      const toCentre = {
        x: (w / 2 - target.x) / target.z,
        y: (h / 2 - target.y) / target.z,
      };
      const cx = fromCentre.x + (toCentre.x - fromCentre.x) * ease;
      const cy = fromCentre.y + (toCentre.y - fromCentre.y) * ease;
      camera.current = { x: w / 2 - cx * z, y: h / 2 - cy * z, z };
      apply();
      if (t < 1) animation.current = requestAnimationFrame(step);
    };
    animation.current = requestAnimationFrame(step);
  };

  const frameRect = (
    rect: { x: number; y: number; w: number; h: number },
    maxZoom = 1,
    padding = 48,
    leftInset = 0,
    topInset = TOP_INSET,
    minZoom = MIN_ZOOM,
  ) => {
    const board = boardRef.current;
    const w = (board?.clientWidth ?? 1200) - leftInset;
    const h = (board?.clientHeight ?? 800) - topInset;
    const z = clamp(
      Math.min((w - padding * 2) / rect.w, (h - padding * 2) / rect.h),
      minZoom,
      maxZoom,
    );
    return {
      x: leftInset + w / 2 - (rect.x + rect.w / 2) * z,
      y: topInset + h / 2 - (rect.y + rect.h / 2) * z,
      z,
    };
  };

  const fit = () => {
    flyTo(
      frameRect(
        { x: 0, y: 0, w: deckTable.width, h: Math.max(deckTable.height, 400) },
        DECK_ZOOM - 0.02,
      ),
    );
  };

  const zoomBy = (factor: number, sx?: number, sy?: number) => {
    const board = boardRef.current;
    if (!board) return;
    const px = sx ?? board.clientWidth / 2;
    const py = sy ?? board.clientHeight / 2;
    const { x, y, z } = camera.current;
    const next = clamp(z * factor, MIN_ZOOM, MAX_ZOOM);
    camera.current = crossWorlds(
      camera.current,
      {
        x: px - ((px - x) / z) * next,
        y: py - ((py - y) / z) * next,
        z: next,
      },
      px,
      py,
    );
    apply();
  };

  // restore the last camera for this scope, otherwise start on the first
  // clusters at a readable size. only the scope decides where the camera
  // starts, so the latest model is read through an effect event
  const placeInitialCamera = useEffectEvent((board: HTMLElement) => {
    const restored = readSavedCamera(viewKey);
    // decks first, so opening a module starts from the overview. a phone gets two columns and pans
    const table = deckTableFor(
      model.modules,
      board.clientWidth < 640 ? DECK_COLUMNS_NARROW : DECK_COLUMNS,
    );
    const start = frameRect(
      { x: 0, y: 0, w: table.width, h: Math.min(Math.max(table.height, 400), 1900) },
      DECK_ZOOM - 0.02,
      16,
    );
    camera.current =
      restored ??
      (board.clientWidth < 640 ? { ...start, y: TOP_INSET + 4 } : start);
    apply();
  });
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    placeInitialCamera(board);
  }, [viewKey]);

  useEffect(() => {
    const save = () => {
      try {
        window.sessionStorage.setItem(
          `oghma-study-flow-camera-v2:${viewKey}`,
          JSON.stringify(camera.current),
        );
      } catch {
        // the camera is a convenience; private browsing can refuse storage
      }
    };
    const timer = window.setTimeout(save, 300);
    return () => window.clearTimeout(timer);
  }, [view, viewKey]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => applyCamera());
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      cancelAnimationFrame(animation.current);
      window.clearTimeout(previewTimer.current);
      window.clearTimeout(leaveTimer.current);
    },
    [],
  );

  // wheel must be non-passive to keep the page from scrolling under the canvas
  const zoomFromWheel = useEffectEvent(zoomBy);
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const onWheel = (event: WheelEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-flow-overlay]")
      )
        return;
      event.preventDefault();
      cancelAnimationFrame(animation.current);
      const rect = board.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        zoomFromWheel(
          Math.exp(
            -event.deltaY *
              (event.ctrlKey && !event.metaKey && Math.abs(event.deltaY) < 30
                ? 0.012
                : 0.002),
          ),
          event.clientX - rect.left,
          event.clientY - rect.top,
        );
        return;
      }
      const unit = event.deltaMode === 1 ? 16 : 1;
      camera.current = {
        ...camera.current,
        x:
          camera.current.x -
          (event.shiftKey ? event.deltaY : event.deltaX) * unit,
        y: camera.current.y - (event.shiftKey ? 0 : event.deltaY) * unit,
      };
      applyCamera();
    };
    board.addEventListener("wheel", onWheel, { passive: false });
    return () => board.removeEventListener("wheel", onWheel);
  }, []);

  const deckMode = view.z < DECK_ZOOM;
  const compact = view.z < COMPACT_ZOOM;
  const lowerQuery = query.trim().toLocaleLowerCase();

  const visible = useCallback(
    (placed: Placed) => !hidden.has(filterKey(placed.item)),
    [hidden],
  );
  const tagsShown = useCallback(
    (item: FlowItem) =>
      showSuggested ? item.tags : item.tags.filter((tag) => !tag.suggested),
    [showSuggested],
  );

  // useMemo stays for the board geometry below: these values are interleaved
  // with hooks and helper calls the compiler can't prove pure, so it would
  // rebuild them and re-diff every card and edge on each pan frame
  const trail = useMemo(() => {
    if (!focus) return [];
    const topic = model.topics.get(focus.topicId);
    const module = model.modules.find((entry) => entry.mapId === topic?.mapId);
    if (!topic || !module) return [];
    return topicTrail(
      focus.topicId,
      module.items.filter((item) => {
        const placed = model.byRef.get(item.ref);
        return (
          placed &&
          visible(placed) &&
          tagsShown(item).some((tag) => tag.topicId === focus.topicId)
        );
      }),
      module.layout,
    );
  }, [focus, model, tagsShown, visible]);

  const relatedTo = useCallback(
    (active: string | null) => {
      const set = new Set<string>();
      if (!active) return set;
      for (const link of model.links) {
        if (link.source === active) set.add(link.target);
        if (link.target === active) set.add(link.source);
      }
      for (const item of model.sources.get(active) ?? []) set.add(item.ref);
      for (const item of model.usedBy.get(active) ?? []) set.add(item.ref);
      return set;
    },
    [model],
  );
  const related = useMemo(
    () => relatedTo(hovered ?? selected),
    [hovered, relatedTo, selected],
  );
  const selectedRelated = useMemo(
    () => relatedTo(selected),
    [relatedTo, selected],
  );

  const cardState = useMemo(() => {
    const state = new Map<string, string>();
    const trailRefs = new Set(trail.map((item) => item.ref));
    for (const placed of model.ordered) {
      const flags: string[] = [];
      const { ref } = placed.item;
      if (ref === selected) flags.push("selected");
      if (related.has(ref)) flags.push("related");
      // a picked card fades everything it has nothing to do with
      if (
        !focus &&
        !connect &&
        selected &&
        ref !== selected &&
        !selectedRelated.has(ref)
      )
        flags.push("dim");
      if (ref === flash) flags.push("flash");
      if (lowerQuery && !matchesQuery(placed, lowerQuery, model.topics))
        flags.push("dim");
      if (focus && !trailRefs.has(ref)) {
        const touches = tagsShown(placed.item).some(
          (tag) => tag.topicId === focus.topicId,
        );
        flags.push(touches ? "supporting" : "dim");
      }
      if (
        connect &&
        placed.item.mapId !== model.byRef.get(connect.from)?.item.mapId
      )
        flags.push("dim");
      if (flags.length) state.set(ref, flags.join(" "));
    }
    return state;
  }, [
    connect,
    flash,
    focus,
    lowerQuery,
    model,
    related,
    selected,
    selectedRelated,
    tagsShown,
    trail,
  ]);

  const stops = useMemo(
    () => new Map(trail.map((item, index) => [item.ref, index])),
    [trail],
  );

  const positioned = useMemo(
    () =>
      model.ordered
        .filter(visible)
        .map((placed) =>
          dragging?.ref === placed.item.ref
            ? { ...placed, x: dragging.x, y: dragging.y }
            : placed,
        ),
    [dragging, model.ordered, visible],
  );

  const culled =
    positioned.length <= CULL_THRESHOLD
      ? positioned
      : cullToView(positioned, view, selected);

  const positionOf = useCallback(
    (ref: string) => positioned.find((placed) => placed.item.ref === ref),
    [positioned],
  );

  const goTo = (ref: string, open = false) => {
    const placed = model.byRef.get(ref);
    if (!placed) return;
    if (!visible(placed)) {
      setHidden((current) => {
        const next = new Set(current);
        next.delete(filterKey(placed.item));
        return next;
      });
    }
    if (
      focus &&
      !tagsShown(placed.item).some((tag) => tag.topicId === focus.topicId)
    )
      setFocus(null);
    const board = boardRef.current;
    const z = Math.max(camera.current.z, 0.75);
    const w = board?.clientWidth ?? 1200;
    const h = board?.clientHeight ?? 800;
    flyTo({
      x: w / 2 - (placed.x + CARD_WIDTH / 2) * z,
      y: h / 2 - (placed.y + placed.item.height / 2) * z,
      z,
    });
    setSelected(ref);
    setFlash(ref);
    window.setTimeout(
      () => setFlash((current) => (current === ref ? null : current)),
      1200,
    );
    setAnnouncement(`Showing ${placed.item.title}`);
    window.setTimeout(
      () =>
        boardRef.current
          ?.querySelector<HTMLElement>(`[data-card="${ref}"]`)
          ?.focus({ preventScroll: true }),
      420,
    );
    if (open) setPreview({ ref, pinned: true });
  };

  const follow = (topicId: string) => {
    const topic = model.topics.get(topicId);
    if (!topic) {
      onShowAllModules?.();
      return;
    }
    setPreview(null);
    setFocus({ topicId, stop: 0 });
    const module = model.modules.find((entry) => entry.mapId === topic.mapId);
    if (!module) return;
    const items = topicTrail(topicId, module.items, module.layout)
      .map((item) => model.byRef.get(item.ref))
      .filter((placed): placed is Placed => Boolean(placed));
    const cluster = module.layout.clusters.find(
      (entry) => entry.key === topicId,
    );
    const rects = [
      ...items.map(rectOf),
      ...(cluster ? [headerRect(module, cluster)] : []),
    ];
    if (!rects.length) return;
    const x = Math.min(...rects.map((rect) => rect.x));
    const y = Math.min(...rects.map((rect) => rect.y));
    const width = Math.max(...rects.map((rect) => rect.x + rect.w)) - x;
    const height = Math.max(...rects.map((rect) => rect.y + rect.h)) - y;
    flyTo(
      frameRect({ x, y, w: width, h: height }, 0.9, 40, 340, TOP_INSET, DECK_ZOOM),
    );
    setAnnouncement(
      `Following ${topic.name}: ${items.length} ${items.length === 1 ? "stop" : "stops"}`,
    );
  };

  const step = (index: number) => {
    if (!focus || !trail.length) return;
    const next = clamp(index, 0, trail.length - 1);
    setFocus({ ...focus, stop: next });
    goTo(trail[next].ref);
  };

  // board edits
  const moduleOf = (ref: string) => model.byRef.get(ref)?.module;
  const updateBoard = (ref: string, change: (board: StudyBoard) => StudyBoard) => {
    const module = moduleOf(ref);
    if (!module) return;
    onBoardChange(module.mapId, change(module.board));
  };

  const place = (ref: string, x: number, y: number) => {
    updateBoard(ref, (board) => {
      const module = moduleOf(ref)!;
      const existing = board.placements.find(
        (placement) => placement.id === ref,
      );
      const placement = {
        id: ref,
        x: Math.round(x / 8) * 8,
        y: Math.round((y - module.originY) / 8) * 8,
        pinned: existing?.pinned ?? false,
        topicId: null,
      };
      return {
        ...board,
        placements: [
          ...board.placements.filter((entry) => entry.id !== ref),
          placement,
        ],
      };
    });
  };

  const togglePin = (ref: string) => {
    const placed = model.byRef.get(ref);
    if (!placed) return;
    const existing = placed.module.board.placements.find(
      (placement) => placement.id === ref,
    );
    updateBoard(ref, (board) => ({
      ...board,
      placements: [
        ...board.placements.filter((entry) => entry.id !== ref),
        {
          id: ref,
          x: existing?.x ?? placed.x,
          y: existing?.y ?? placed.y - placed.module.originY,
          pinned: !existing?.pinned,
          topicId: null,
        },
      ],
    }));
    setAnnouncement(existing?.pinned ? "Unpinned" : "Pinned in place");
  };

  const resetPosition = (ref: string) => {
    updateBoard(ref, (board) => ({
      ...board,
      placements: board.placements.filter((entry) => entry.id !== ref),
    }));
    setAnnouncement("Back in its topic cluster");
  };

  const setWeek = (ref: string, value: string) => {
    updateBoard(ref, (board) => {
      const weeks = { ...board.weeks };
      if (value === "detected") delete weeks[ref];
      else weeks[ref] = Number(value);
      // a new week reorders its cluster, so an unpinned card goes back into its place there
      return {
        ...board,
        weeks,
        placements: board.placements.filter(
          (entry) => entry.id !== ref || entry.pinned,
        ),
      };
    });
  };

  const splitOut = (ref: string, copyRef: string) => {
    updateBoard(ref, (board) => ({
      ...board,
      unfolded: [...(board.unfolded ?? []), copyRef],
    }));
    setAnnouncement("Split out. It has its own card again.");
  };

  const tidy = () => {
    let moved = 0;
    for (const module of model.modules) {
      const kept = module.board.placements.filter(
        (placement) => placement.pinned,
      );
      moved += module.board.placements.length - kept.length;
      if (kept.length !== module.board.placements.length)
        onBoardChange(module.mapId, { ...module.board, placements: kept });
    }
    setAnnouncement(
      moved
        ? `Tidied ${moved} ${moved === 1 ? "card" : "cards"}. Pinned cards stay put.`
        : "Everything is already in its topic cluster.",
    );
  };

  const saveLink = () => {
    if (!connect?.to || !connect.label.trim()) return;
    const { from, to, label } = connect;
    updateBoard(from, (board) => ({
      ...board,
      links: [
        ...board.links,
        {
          id: crypto.randomUUID(),
          source: from,
          target: to,
          label: label.trim().slice(0, 80),
        },
      ],
    }));
    setConnect(null);
    setAnnouncement(`Linked: ${label.trim()}`);
  };

  const removeLink = (link: FlowLink) => {
    updateBoard(link.source, (board) => ({
      ...board,
      links: board.links.filter((entry) => entry.id !== link.id),
    }));
    setAnnouncement("Link removed");
  };

  // pointer input: drag a card, pan the canvas, or pinch to zoom
  const boardPoint = (event: { clientX: number; clientY: number }) => {
    const rect = boardRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-flow-overlay]")) return;
    cancelAnimationFrame(animation.current);
    pointers.current.set(event.pointerId, boardPoint(event));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        kind: "pinch",
        startX: (a.x + b.x) / 2,
        startY: (a.y + b.y) / 2,
        camera: { ...camera.current },
        moved: true,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
      };
      dragPosition.current = null;
      setDragging(null);
      return;
    }
    if (target?.closest("button, a, input, select, textarea")) return;
    const card = target?.closest<HTMLElement>("[data-card]");
    const ref = card?.dataset.card;
    const placed = ref ? model.byRef.get(ref) : undefined;
    const pinned = placed?.module.board.placements.some(
      (entry) => entry.id === ref && entry.pinned,
    );
    // on touch, a card moves only once selected; otherwise one finger pans
    const movable =
      placed &&
      !pinned &&
      !connect &&
      event.button === 0 &&
      (event.pointerType !== "touch" || selected === ref);
    gesture.current = {
      kind: movable ? "card" : "pan",
      ref,
      startX: event.clientX,
      startY: event.clientY,
      camera: { ...camera.current },
      origin: placed ? { x: placed.x, y: placed.y } : undefined,
      moved: false,
    };
  }

  function onPointerMove(
    event: PointerEvent | ReactPointerEvent<HTMLDivElement>,
  ) {
    if (pointers.current.has(event.pointerId))
      pointers.current.set(event.pointerId, boardPoint(event));
    const current = gesture.current;
    if (!current) return;
    if (current.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const z = clamp(
        current.camera.z * (distance / (current.distance || distance)),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      const wx = (current.startX - current.camera.x) / current.camera.z;
      const wy = (current.startY - current.camera.y) / current.camera.z;
      const pinched = { x: centre.x - wx * z, y: centre.y - wy * z, z };
      camera.current = crossWorlds(camera.current, pinched, centre.x, centre.y);
      // the gesture continues from the other side of the threshold
      if (camera.current !== pinched) {
        current.camera = { ...camera.current };
        current.startX = centre.x;
        current.startY = centre.y;
        current.distance = distance;
      }
      apply();
      return;
    }
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < 4) return;
    if (!current.moved) {
      current.moved = true;
      setPreview(null);
      window.clearTimeout(previewTimer.current);
    }
    if (current.kind === "pan") {
      camera.current = {
        ...camera.current,
        x: current.camera.x + dx,
        y: current.camera.y + dy,
      };
      apply();
    } else if (current.kind === "card" && current.ref && current.origin) {
      const next = {
        ref: current.ref,
        x: current.origin.x + dx / camera.current.z,
        y: current.origin.y + dy / camera.current.z,
      };
      dragPosition.current = next;
      setDragging(next);
    }
  }

  function onPointerUp(
    event: PointerEvent | ReactPointerEvent<HTMLDivElement>,
  ) {
    pointers.current.delete(event.pointerId);
    const current = gesture.current;
    if (!current) return;
    if (current.kind === "pinch") {
      if (pointers.current.size < 2) gesture.current = null;
      suppressClick.current = true;
      return;
    }
    gesture.current = null;
    if (current.kind === "card" && current.moved && dragPosition.current) {
      const { ref, x, y } = dragPosition.current;
      place(ref, x, y);
      dragPosition.current = null;
      setDragging(null);
      setAnnouncement(
        "Moved. Its topics are unchanged; Tidy layout puts it back.",
      );
    }
    suppressClick.current = current.moved;
  }

  function onClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("[data-flow-overlay]")) return;
    const legend = target.closest<HTMLElement>("[data-legend]");
    if (legend?.dataset.legend) {
      if (focus?.topicId === legend.dataset.legend) setFocus(null);
      else follow(legend.dataset.legend);
      return;
    }
    const open = target.closest<HTMLElement>("[data-open-module]");
    if (open?.dataset.openModule) return onOpenModule(open.dataset.openModule);
    const all = target.closest<HTMLElement>("[data-deck-all]");
    if (all?.dataset.deckAll) return showCluster(all.dataset.deckAll);
    const fanned = target.closest<HTMLElement>("[data-fan]");
    if (fanned?.dataset.fan) {
      setSelected(fanned.dataset.fan);
      setPreview({ ref: fanned.dataset.fan, pinned: true });
      return;
    }
    const deck = target.closest<HTMLElement>("[data-deck]");
    if (deck?.dataset.deck) {
      setOpenDeck((current) =>
        current === deck.dataset.deck ? null : (deck.dataset.deck ?? null),
      );
      setSelected(null);
      setPreview(null);
      return;
    }
    const card = target.closest<HTMLElement>("[data-card]");
    const ref = card?.dataset.card;
    if (ref) {
      if (connect) {
        const from = model.byRef.get(connect.from);
        const to = model.byRef.get(ref);
        if (!from || !to || ref === connect.from) return;
        if (from.item.mapId !== to.item.mapId) {
          setAnnouncement(
            "Links you draw stay inside one module. Note links across modules come from the notes themselves.",
          );
          return;
        }
        setConnect({ ...connect, to: ref });
        return;
      }
      setSelected(ref);
      setPreview({ ref, pinned: true });
      return;
    }
    setSelected(null);
    setPreview(null);
    setOpenDeck(null);
    if (connect && !connect.to) setConnect(null);
  }

  function showCluster(deckId: string) {
    for (const { module, table } of deckTable.modules) {
      const cluster = table.decks.find((deck) => deck.id === deckId)?.cluster;
      if (!cluster) continue;
      setOpenDeck(null);
      flyTo(
        frameRect(
          {
            x: cluster.x,
            y: module.originY + cluster.y,
            w: cluster.width,
            h: cluster.height,
          },
          0.9,
          32,
          0,
          TOP_INSET,
          DECK_ZOOM,
        ),
      );
      return;
    }
  }

  function openReader(ref: string) {
    const placed = model.byRef.get(ref);
    if (!placed) return;
    setPreview(null);
    if (placed.item.assignment) setAssignmentOpen(placed.item.assignment);
    else setReader(ref);
  }

  function onDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;
    const ref =
      target?.closest<HTMLElement>("[data-card]")?.dataset.card ??
      target?.closest<HTMLElement>("[data-fan]")?.dataset.fan;
    if (!ref || target?.closest("button, a")) return;
    openReader(ref);
  }

  function onPointerOver(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" || gesture.current?.moved) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-flow-overlay]")) {
      window.clearTimeout(leaveTimer.current);
      return;
    }
    const ref =
      target?.closest<HTMLElement>("[data-card]")?.dataset.card ?? null;
    const legend =
      target?.closest<HTMLElement>("[data-legend]")?.dataset.legend ?? null;
    if (legend !== hoverTopic) setHoverTopic(legend);
    if (ref === hovered) return;
    setHovered(ref);
    window.clearTimeout(previewTimer.current);
    window.clearTimeout(leaveTimer.current);
    // link mode needs the cards clear, so no hover previews while it is on
    if (ref && !compact && !connect)
      previewTimer.current = window.setTimeout(
        () =>
          setPreview((current) =>
            current?.pinned ? current : { ref, pinned: false },
          ),
        450,
      );
    else
      leaveTimer.current = window.setTimeout(
        () => setPreview((current) => (current?.pinned ? current : null)),
        250,
      );
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable=true]"))
      return;
    if (
      (event.key === "Enter" || event.key === " ") &&
      target?.closest("[data-deck], [data-fan], [data-deck-all]")
    ) {
      event.preventDefault();
      target.click();
      return;
    }
    const ref = target?.closest<HTMLElement>("[data-card]")?.dataset.card;
    if (ref) {
      if (event.key === "Enter") {
        event.preventDefault();
        openReader(ref);
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        setSelected(ref);
        setPreview((current) =>
          current?.ref === ref ? null : { ref, pinned: true },
        );
        return;
      }
      if (event.key.toLowerCase() === "p" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        togglePin(ref);
        return;
      }
      if (event.shiftKey && event.key.startsWith("Arrow")) {
        event.preventDefault();
        const placed = model.byRef.get(ref);
        if (
          !placed ||
          placed.module.board.placements.some(
            (entry) => entry.id === ref && entry.pinned,
          )
        )
          return;
        const delta = {
          ArrowLeft: [-16, 0],
          ArrowRight: [16, 0],
          ArrowUp: [0, -16],
          ArrowDown: [0, 16],
        }[event.key];
        if (delta) place(ref, placed.x + delta[0], placed.y + delta[1]);
        return;
      }
    }
    if (event.key === "Escape") {
      if (connect) setConnect(null);
      else if (preview) setPreview(null);
      else if (selected) setSelected(null);
      else if (openDeck) setOpenDeck(null);
      else if (focus) setFocus(null);
      else return;
      event.preventDefault();
      return;
    }
    if (focus && (event.key === "]" || event.key === "[")) {
      event.preventDefault();
      step(focus.stop + (event.key === "]" ? 1 : -1));
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomBy(1.25);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomBy(0.8);
      return;
    }
    if (event.key === "!" || (event.shiftKey && event.code === "Digit1")) {
      event.preventDefault();
      fit();
      return;
    }
    if (!ref && event.key.startsWith("Arrow")) {
      event.preventDefault();
      const delta = {
        ArrowLeft: [80, 0],
        ArrowRight: [-80, 0],
        ArrowUp: [0, 80],
        ArrowDown: [0, -80],
      }[event.key];
      if (delta) {
        camera.current = {
          ...camera.current,
          x: camera.current.x + delta[0],
          y: camera.current.y + delta[1],
        };
        apply();
      }
    }
  }

  function onFocusCapture(event: ReactFocusEvent<HTMLDivElement>) {
    // keep keyboard focus visible by bringing an offscreen card into view
    const card =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-card]")
        : null;
    const ref = card?.dataset.card;
    const placed = ref ? model.byRef.get(ref) : undefined;
    const board = boardRef.current;
    if (!placed || !board || gesture.current) return;
    const { x, y, z } = camera.current;
    const sx = placed.x * z + x;
    const sy = placed.y * z + y;
    if (
      sx < 0 ||
      sy < 0 ||
      sx + CARD_WIDTH * z > board.clientWidth ||
      sy + placed.item.height * z > board.clientHeight
    ) {
      flyTo(
        {
          x: board.clientWidth / 2 - (placed.x + CARD_WIDTH / 2) * z,
          y: board.clientHeight / 2 - (placed.y + placed.item.height / 2) * z,
          z,
        },
        200,
      );
    }
  }

  // drags continue outside the board without capturing the pointer, which would retarget clicks
  const onWindowPointerMove = useEffectEvent((event: PointerEvent) =>
    onPointerMove(event),
  );
  const onWindowPointerUp = useEffectEvent((event: PointerEvent) =>
    onPointerUp(event),
  );
  useEffect(() => {
    const move = (event: PointerEvent) => onWindowPointerMove(event);
    const up = (event: PointerEvent) => onWindowPointerUp(event);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  // geometry for topic relations, links and bridges
  const activeRef = hovered ?? selected;
  const svg = useMemo(() => {
    // edges sit under the cluster frames so they only show in the gaps between clusters
    const edges: ReactNode[] = [];
    const under: ReactNode[] = [];
    const over: ReactNode[] = [];
    const labels: Array<{
      key: string;
      x: number;
      y: number;
      text: string;
      link?: FlowLink;
      tone: "plain" | "cross" | "strong";
    }> = [];
    const active = activeRef ? model.byRef.get(activeRef) : undefined;
    const activeTopic = active?.module.layout.primary.get(active.item.ref);
    for (const module of model.modules) {
      const strongest = Math.max(
        0,
        ...module.layout.relations.map((relation) => relation.weight),
      );
      for (const relation of module.layout.relations) {
        const a = module.layout.clusters.find(
          (cluster) => cluster.key === relation.a,
        );
        const b = module.layout.clusters.find(
          (cluster) => cluster.key === relation.b,
        );
        if (!a || !b) continue;
        const ra = headerRect(module, a);
        const rb = headerRect(module, b);
        // on one shelf with clusters between them, a straight line would run behind those clusters, so it arcs over
        const blocked =
          a.y === b.y &&
          module.layout.clusters.some(
            (cluster) =>
              cluster.y === a.y &&
              cluster.x > Math.min(a.x, b.x) &&
              cluster.x < Math.max(a.x, b.x),
          );
        const ax = ra.x + ra.w / 2;
        const bx = rb.x + rb.w / 2;
        const lift = Math.min(60, 28 + Math.abs(bx - ax) * 0.04);
        const d = blocked
          ? `M${ax},${ra.y} C${ax},${ra.y - lift} ${bx},${rb.y - lift} ${bx},${rb.y}`
          : connector(ra, rb).d;
        const lit = [focus?.topicId, hoverTopic, activeTopic].some(
          (topicId) => topicId === relation.a || topicId === relation.b,
        );
        if (!lit) continue;
        edges.push(
          <path
            key={`relation-${relation.a}-${relation.b}`}
            data-relation={`${relation.a} ${relation.b}`}
            d={d}
            fill="none"
            stroke="var(--color-text-secondary)"
            strokeWidth={1.5 + 5 * (relation.weight / (strongest || 1))}
            strokeLinecap="round"
            opacity={0.7}
          />,
        );
      }
    }
    // a hovered or selected card points at the clusters of its other topics
    if (active && !connect) {
      for (const tag of tagsShown(active.item)) {
        if (tag.topicId === activeTopic) continue;
        const target = model.clusters.get(tag.topicId);
        if (!target || target.module !== active.module) continue;
        const position = positionOf(active.item.ref) ?? active;
        over.push(
          <path
            key={`topic-line-${tag.topicId}`}
            data-topic-line={tag.topicId}
            d={
              connector(
                rectOf(position),
                headerRect(target.module, target.cluster),
              ).d
            }
            fill="none"
            stroke={model.topics.get(tag.topicId)?.colour}
            strokeWidth={tag.relevance === "core" ? 2 : 1.4}
            strokeDasharray="3 5"
            strokeLinecap="round"
            opacity={0.55}
          />,
        );
      }
    }
    // following a topic draws its stops in order, wherever their clusters are
    if (focus && trail.length > 1) {
      const points = trail
        .map((item) => positionOf(item.ref))
        .filter((placed): placed is Placed => placed !== undefined)
        .map((placed) => ({
          x: placed.x + CARD_WIDTH / 2,
          y: placed.y + Math.min(placed.item.height / 2, 70),
        }));
      if (points.length > 1)
        under.push(
          <path
            key="trail"
            d={ribbon(points)}
            fill="none"
            stroke={model.topics.get(focus.topicId)?.colour}
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.22}
          />,
        );
    }
    if (showLinks) {
      for (const link of model.links) {
        const a = positionOf(link.source);
        const b = positionOf(link.target);
        if (!a || !b) continue;
        const geometry = connector(rectOf(a), rectOf(b));
        const cross = a.item.mapId !== b.item.mapId;
        const strong =
          activeRef === link.source ||
          activeRef === link.target ||
          (focus !== null && stops.has(link.source) && stops.has(link.target));
        // links stay out of the way until a card that has them is picked
        if (!strong) continue;
        const path = (
          <path
            key={link.id}
            d={geometry.d}
            fill="none"
            stroke="var(--color-text-secondary)"
            strokeWidth={2.4}
            strokeDasharray={
              cross ? "8 6" : link.origin === "note" ? undefined : "2 4"
            }
            opacity={0.85}
            markerEnd="url(#flow-arrow)"
          />
        );
        over.push(
          <path
            key={`${link.id}-halo`}
            d={geometry.d}
            fill="none"
            stroke="var(--color-background)"
            strokeWidth={8}
            opacity={0.8}
          />,
          path,
        );
        labels.push({
          key: link.id,
          x: geometry.mid.x,
          y: geometry.mid.y,
          text: link.label,
          link,
          tone: "strong",
        });
      }
    }
    if (activeRef && model.sources.has(activeRef)) {
      const assignment = positionOf(activeRef);
      for (const source of model.sources.get(activeRef) ?? []) {
        const placed = positionOf(source.ref);
        if (!assignment || !placed) continue;
        const geometry = connector(rectOf(placed), rectOf(assignment));
        over.push(
          <path
            key={`source-${source.ref}`}
            d={geometry.d}
            fill="none"
            stroke="var(--color-ai-500)"
            strokeWidth={2.2}
            strokeDasharray="2 5"
            strokeLinecap="round"
            markerEnd="url(#flow-arrow)"
          />,
        );
      }
    }
    // topics linked across modules curve out through the left margin
    for (const bridge of model.bridges) {
      const ca = model.clusters.get(bridge.a);
      const cb = model.clusters.get(bridge.b);
      if (!ca || !cb) continue;
      const ra = headerRect(ca.module, ca.cluster);
      const rb = headerRect(cb.module, cb.cluster);
      const ya = ra.y + CLUSTER_HEADER / 2;
      const yb = rb.y + CLUSTER_HEADER / 2;
      const bend = -120 - Math.abs(yb - ya) * 0.05;
      const d = `M${ra.x},${ya} C${bend},${ya} ${bend},${yb} ${rb.x},${yb}`;
      const on =
        [bridge.a, bridge.b].includes(focus?.topicId ?? "") ||
        [bridge.a, bridge.b].includes(hoverTopic ?? "");
      if (!on) continue;
      over.push(
        <path
          key={`bridge-${bridge.a}-${bridge.b}-${bridge.reason}`}
          d={d}
          fill="none"
          stroke="var(--color-text-tertiary)"
          strokeWidth={2.4}
          strokeDasharray="8 6"
          opacity={0.9}
        />,
      );
      labels.push({
          key: `bridge-${bridge.a}-${bridge.b}-${bridge.reason}`,
          x: bend * 0.75 + 4,
          y: (ya + yb) / 2,
          text:
            bridge.reason === "same name"
              ? "same topic name"
              : `${bridge.count} linked notes`,
          tone: "cross",
        });
    }
    return { edges, under, over, labels };
  }, [
    activeRef,
    connect,
    focus,
    hoverTopic,
    model,
    positionOf,
    showLinks,
    stops,
    tagsShown,
    trail,
  ]);

  const previewPlaced = preview ? model.byRef.get(preview.ref) : undefined;
  const previewPin = previewPlaced?.module.board.placements.find(
    (entry) => entry.id === previewPlaced.item.ref,
  );
  const readerPlaced = reader ? model.byRef.get(reader) : undefined;
  const focusTopic = focus ? model.topics.get(focus.topicId) : undefined;
  const focusModule = focusTopic
    ? model.modules.find((module) => module.mapId === focusTopic.mapId)
    : undefined;
  const lookup = (ref: string) => model.byRef.get(ref);
  const toScreen = (x: number, y: number) => ({
    x: x * view.z + view.x,
    y: y * view.z + view.y,
  });

  const previewStyle = (() => {
    if (!previewPlaced) return undefined;
    if (deckMode) {
      const width = Math.min(340, view.w - 16);
      const top = view.w < 640 ? Math.max(8, view.h - 420) : TOP_INSET + 8;
      return {
        left: view.w - width - (view.w < 640 ? 8 : 16),
        top,
        width,
        maxHeight: view.h - top - 8,
      };
    }
    const placed = positionOf(previewPlaced.item.ref) ?? previewPlaced;
    const topLeft = toScreen(placed.x, placed.y);
    const right = toScreen(placed.x + CARD_WIDTH, placed.y);
    const width = Math.min(360, view.w - 16);
    const left =
      right.x + 12 + width < view.w
        ? right.x + 12
        : Math.max(8, topLeft.x - 12 - width);
    const height = Math.min(560, view.h - 16);
    const top = clamp(topLeft.y, 8, Math.max(8, view.h - height - 8));
    return { left, top, width, maxHeight: view.h - top - 8 };
  })();

  const weekOptions = (placed: Placed) => {
    const max =
      Math.max(14, ...placed.module.items.map((item) => item.week ?? 0)) + 2;
    return Array.from({ length: max }, (_, index) => index + 1);
  };

  const filtered = hidden.size > 0 || !showSuggested || !showLinks;

  const visibleRefs = (deck: Deck) =>
    deck.cluster.refs.filter((ref) => {
      const placed = model.byRef.get(ref);
      return placed && visible(placed);
    });
  const matchesRef = (ref: string) => {
    const placed = model.byRef.get(ref);
    return placed ? matchesQuery(placed, lowerQuery, model.topics) : false;
  };
  const deckOf = (ref: string) => {
    const placed = model.byRef.get(ref);
    const key = placed?.module.layout.primary.get(ref);
    const entry = deckTable.modules.find(
      ({ module }) => module === placed?.module,
    );
    const deck = entry?.table.decks.find((candidate) => candidate.key === key);
    return entry && deck ? { deck, originY: entry.originY } : null;
  };
  // the picked card in a fan points at the decks of whatever it links to
  const deckLines: DeckLayerProps["lines"] = [];
  const litDecks = new Set(openDeck ? [openDeck] : []);
  const fanned = deckMode && openDeck && selected
    ? deckTable.modules.flatMap((entry) =>
        entry.table.decks
          .filter((deck) => deck.id === openDeck)
          .map((deck) => ({ deck, originY: entry.originY })),
      )[0]
    : null;
  if (fanned && selected) {
    const refs = visibleRefs(fanned.deck).slice(0, FAN_MAX_CARDS);
    const index = refs.indexOf(selected);
    const slots = fanPositions(
      { x: fanned.deck.x, y: fanned.originY + fanned.deck.y },
      refs.length + (visibleRefs(fanned.deck).length > refs.length ? 1 : 0),
      deckTable.width,
    );
    const slot = slots[index];
    if (slot) {
      const labelFor = (other: string) =>
        model.links.find(
          (link) =>
            (link.source === selected && link.target === other) ||
            (link.target === selected && link.source === other),
        )?.label ?? (model.sources.has(selected) ? "uses" : "used in");
      const seen = new Set<string>();
      for (const other of selectedRelated) {
        const target = deckOf(other);
        if (!target || target.deck.id === openDeck) continue;
        if (seen.has(target.deck.id)) continue;
        seen.add(target.deck.id);
        litDecks.add(target.deck.id);
        const geometry = connector(
          { x: slot.x, y: slot.y, w: FAN_CARD_WIDTH, h: FAN_CARD_HEIGHT },
          {
            x: target.deck.x,
            y: target.originY + target.deck.y,
            w: target.deck.width,
            h: target.deck.height,
          },
        );
        deckLines.push({
          key: `${selected}-${target.deck.id}`,
          d: geometry.d,
          x: geometry.mid.x,
          y: geometry.mid.y,
          label: labelFor(other),
        });
      }
    }
  }

  return (
    <div className="relative flex h-full min-h-0 w-full">
      <div className="relative min-h-0 min-w-0 flex-1">
        <div
          ref={boardRef}
          role="application"
          aria-roledescription="study map"
          aria-label="Study map. Zoomed out, each topic is a deck: Enter fans it out. Zoomed in, cards are grouped by topic. Tab moves between them, Enter reads a card, Space previews it."
          tabIndex={0}
          className="absolute inset-0 touch-none select-none overflow-hidden bg-background focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-500"
          style={{
            backgroundImage:
              "radial-gradient(var(--color-border-subtle) 1px, transparent 1.2px)",
          }}
          onPointerDown={onPointerDown}
          onPointerOver={onPointerOver}
          onPointerLeave={() => {
            setHovered(null);
            setHoverTopic(null);
            window.clearTimeout(previewTimer.current);
            leaveTimer.current = window.setTimeout(
              () => setPreview((current) => (current?.pinned ? current : null)),
              250,
            );
          }}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onKeyDown={onKeyDown}
          onFocusCapture={onFocusCapture}
        >
          <div
            ref={worldRef}
            className="absolute left-0 top-0 origin-top-left will-change-transform"
          >
            {model.modules.map((module) => {
              const tabled = deckTable.modules.find(
                (entry) => entry.module === module,
              );
              return (
              <section
                key={module.mapId}
                aria-label={`${module.name} ${module.year}`}
                className="absolute rounded-[28px] bg-surface/40"
                style={{
                  left: -24,
                  top: deckMode ? (tabled?.originY ?? 0) : module.originY,
                  width: (deckMode ? deckTable.width : model.width) + 48,
                  height: deckMode
                    ? (tabled?.table.height ?? 0)
                    : module.layout.height,
                }}
              >
                <header
                  className="absolute left-10 flex items-baseline gap-4 whitespace-nowrap"
                  style={{
                    top: deckMode ? 30 : 32,
                    fontSize: deckMode ? 72 : compact ? 44 : 34,
                  }}
                >
                  <h2 className="font-semibold tracking-tight text-text">
                    {module.name}
                  </h2>
                  <span className="text-[0.45em] text-text-tertiary">
                    {module.year} ·{" "}
                    {
                      module.items.filter((item) => item.kind !== "assignment")
                        .length
                    }{" "}
                    materials
                    {module.items.some((item) => item.kind === "assignment")
                      ? ` · ${module.items.filter((item) => item.kind === "assignment").length} assignments`
                      : ""}
                    {module.paperCount
                      ? ` · ${module.paperCount} past ${module.paperCount === 1 ? "paper" : "papers"} in Exam history`
                      : ""}
                  </span>
                  {model.modules.length > 1 && (
                    <button
                      type="button"
                      data-open-module={module.mapId}
                      className="self-center rounded-radius-md border border-border-subtle bg-surface px-2.5 py-1 text-[0.4em] font-medium text-text-secondary hover:text-text"
                    >
                      Open module
                    </button>
                  )}
                </header>
              </section>
              );
            })}
            {deckMode ? (
              <DeckLayer
                table={deckTable}
                topics={model.topics}
                visibleRefs={visibleRefs}
                byRef={model.byRef}
                openKey={openDeck}
                selected={selected}
                lit={litDecks}
                query={lowerQuery}
                matches={matchesRef}
                lines={deckLines}
              />
            ) : (
            <div className="study-layer-in">
            <svg
              className="pointer-events-none absolute left-0 top-0 overflow-visible"
              width={1}
              height={1}
              aria-hidden="true"
            >
              {svg.edges}
            </svg>
            {model.modules.map((module) => (
              <div key={`clusters-${module.mapId}`}>
                {module.layout.clusters.map((cluster) => {
                  const topic = cluster.topic
                    ? model.topics.get(cluster.topic.id)
                    : undefined;
                  const parent = cluster.topic?.parentId
                    ? module.topics.find(
                        (entry) => entry.id === cluster.topic!.parentId,
                      )
                    : undefined;
                  const on = focus?.topicId === cluster.key;
                  const count = cluster.refs.length;
                  const elsewhere = cluster.topic
                    ? module.items.filter(
                        (item) =>
                          module.layout.primary.get(item.ref) !== cluster.key &&
                          item.tags.some((tag) => tag.topicId === cluster.key),
                      ).length
                    : 0;
                  const meta = cluster.topic
                    ? [
                        parent?.name,
                        `${count} ${count === 1 ? "card" : "cards"}`,
                        topic?.exam
                          ?.replace(/^In /, "in ")
                          .replace(/ reviewed.*/, " papers"),
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : `${count} ${count === 1 ? "card" : "cards"} · classify these to sort them`;
                  return (
                    <div
                      key={cluster.key}
                      data-cluster={cluster.key}
                      className={`study-glass absolute rounded-[20px] ${on ? "study-glass-on" : ""} ${lowerQuery && cluster.topic && !cluster.topic.name.toLocaleLowerCase().includes(lowerQuery) ? "opacity-60" : ""}`}
                      style={{
                        left: cluster.x,
                        top: module.originY + cluster.y,
                        width: cluster.width,
                        height: cluster.height,
                      }}
                    >
                      <button
                        type="button"
                        data-legend={cluster.topic ? cluster.key : undefined}
                        disabled={!cluster.topic}
                        aria-pressed={cluster.topic ? on : undefined}
                        title={
                          cluster.topic
                            ? `${cluster.topic.name}: follow this topic`
                            : undefined
                        }
                        className={`flex w-full min-w-0 flex-col justify-center rounded-t-[18px] px-4 text-left transition-colors ${on ? "bg-primary-500/10" : cluster.topic ? "hover:bg-primary-500/5" : ""}`}
                        style={{ height: CLUSTER_HEADER - 4 }}
                      >
                        <span
                          className="flex w-full min-w-0 items-center gap-2 font-semibold leading-tight text-text"
                          style={{ fontSize: compact ? 24 : 15 }}
                        >
                          <span
                            className="shrink-0 rounded-full"
                            style={{
                              width: 8,
                              height: 8,
                              background:
                                topic?.colour ?? "var(--color-text-tertiary)",
                            }}
                            aria-hidden="true"
                          />
                          <span className="truncate">
                            {cluster.topic
                              ? cluster.topic.name
                              : "Not sorted yet"}
                          </span>
                        </span>
                        <span
                          className="w-full truncate text-xs text-text-tertiary"
                          style={{ fontSize: compact ? 16 : undefined }}
                        >
                          {meta}
                        </span>
                      </button>
                      {count === 0 && (
                        <p className="px-4 text-xs text-text-tertiary">
                          {elsewhere
                            ? `Covered by ${elsewhere} ${elsewhere === 1 ? "card" : "cards"} in other clusters`
                            : "No material yet"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            <svg
              className="pointer-events-none absolute left-0 top-0 overflow-visible"
              width={1}
              height={1}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="flow-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M0,1 L9,5 L0,9 z"
                    fill="var(--color-text-tertiary)"
                  />
                </marker>
              </defs>
              {svg.under}
            </svg>
            <CardLayer
              placed={culled}
              compact={compact}
              state={cardState}
              stops={stops}
              focusColour={focusTopic?.colour ?? null}
            />
            <svg
              className="pointer-events-none absolute left-0 top-0 z-10 overflow-visible"
              width={1}
              height={1}
              aria-hidden="true"
            >
              {svg.over}
            </svg>
            {svg.labels.map((label) => (
                <div
                  key={label.key}
                  className={`absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full border bg-surface px-2 py-0.5 text-xs text-text-secondary ${label.tone === "cross" ? "border-dashed border-border" : label.tone === "strong" ? "border-text-tertiary text-text shadow" : "border-border-subtle"}`}
                  style={{ left: label.x, top: label.y }}
                >
                  {label.text}
                  {label.link?.origin === "yours" &&
                    label.tone === "strong" && (
                      <button
                        type="button"
                        data-flow-overlay
                        className="pointer-events-auto rounded-full p-0.5 text-text-tertiary hover:text-error-600"
                        aria-label={`Remove link ${label.text}`}
                        onClick={() => removeLink(label.link!)}
                      >
                        <XMarkIcon className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )}
                </div>
              ))}
            </div>
            )}
          </div>

          {focusTopic && focusModule && (
            <div data-flow-overlay>
              <TrailPanel
                topic={focusTopic}
                moduleName={focusModule.name}
                parentName={
                  focusTopic.parentId
                    ? (model.topics.get(focusTopic.parentId)?.name ?? null)
                    : null
                }
                trail={trail}
                stop={focus?.stop ?? 0}
                supporting={focusModule.items.filter(
                  (item) =>
                    !stops.has(item.ref) &&
                    tagsShown(item).some(
                      (tag) => tag.topicId === focusTopic.id,
                    ),
                )}
                goesWith={focusModule.topics
                  .filter((topic) => topic.id !== focusTopic.id)
                  .map((topic) => ({
                    topic,
                    count: focusModule.items.filter(
                      (item) =>
                        item.tags.some((tag) => tag.topicId === topic.id) &&
                        item.tags.some((tag) => tag.topicId === focusTopic.id),
                    ).length,
                  }))
                  .filter((entry) => entry.count > 0)
                  .sort((a, b) => b.count - a.count)}
                bridges={model.bridges
                  .filter(
                    (bridge) =>
                      bridge.a === focusTopic.id || bridge.b === focusTopic.id,
                  )
                  .flatMap((bridge) => {
                    const other = model.topics.get(
                      bridge.a === focusTopic.id ? bridge.b : bridge.a,
                    );
                    const module = model.modules.find(
                      (entry) => entry.mapId === other?.mapId,
                    );
                    return other && module
                      ? [
                          {
                            topic: other,
                            bridge,
                            moduleName: module.name,
                            loaded: true,
                          },
                        ]
                      : [];
                  })}
                topics={model.topics}
                onStep={step}
                onGo={(ref) => goTo(ref, true)}
                onFollow={follow}
                onClose={() => setFocus(null)}
              />
            </div>
          )}

          {connect && (
            <div
              data-flow-overlay
              className="absolute left-1/2 top-16 z-40 w-[min(440px,calc(100%-1.5rem))] -translate-x-1/2 rounded-radius-xl border border-border-subtle bg-surface p-3 text-sm shadow-lg"
            >
              {!connect.to ? (
                <div className="flex items-center gap-2">
                  <p className="text-text-secondary">
                    Choose the card to link{" "}
                    <b className="text-text">
                      {model.byRef.get(connect.from)?.item.title}
                    </b>{" "}
                    to.
                  </p>
                  <button
                    type="button"
                    className={`${secondarySmall} ml-auto`}
                    onClick={() => setConnect(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveLink();
                  }}
                >
                  <p className="text-text-secondary">
                    <b className="text-text">
                      {model.byRef.get(connect.from)?.item.title}
                    </b>{" "}
                    →{" "}
                    <b className="text-text">
                      {model.byRef.get(connect.to)?.item.title}
                    </b>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {LINK_LABELS.map((label) => (
                      <button
                        key={label}
                        type="button"
                        className={`rounded-full border px-2 py-0.5 text-xs ${connect.label === label ? "border-primary-500 bg-primary-500/10 text-text" : "border-border-subtle text-text-secondary"}`}
                        onClick={() => setConnect({ ...connect, label })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="mt-2 block text-xs text-text-tertiary">
                    Relationship
                    <input
                      autoFocus
                      maxLength={80}
                      value={connect.label}
                      onChange={(event) =>
                        setConnect({ ...connect, label: event.target.value })
                      }
                      className="mt-1 min-h-9 w-full rounded-radius-md border border-border-subtle bg-background px-2 text-base text-text md:text-sm"
                    />
                  </label>
                  <div className="mt-2 flex justify-end gap-1.5">
                    <button
                      type="button"
                      className={secondarySmall}
                      onClick={() => setConnect(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className={primarySmall}
                      disabled={!connect.label.trim()}
                    >
                      Save link
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {previewPlaced && previewStyle && !reader && !connect && (
            <div
              data-flow-overlay
              role="dialog"
              aria-label={`Preview of ${previewPlaced.item.title}`}
              className="study-glass study-glass-blur absolute z-40 overflow-y-auto rounded-[18px] p-4"
              style={previewStyle}
              onPointerEnter={() => window.clearTimeout(leaveTimer.current)}
              onPointerLeave={() => {
                leaveTimer.current = window.setTimeout(
                  () =>
                    setPreview((current) => (current?.pinned ? current : null)),
                  250,
                );
              }}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <ItemHeader placed={previewPlaced} />
                </div>
                {preview?.pinned && (
                  <button
                    type="button"
                    className="rounded-radius-md p-1 text-text-tertiary hover:text-text"
                    onClick={() => setPreview(null)}
                    aria-label="Close preview"
                  >
                    <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              {/* decks stay quick to scan: the file itself only shows up zoomed in */}
              {!deckMode && (
                <div className="mt-2">
                  <ItemBody item={previewPlaced.item} full={false} />
                </div>
              )}
              <ItemRelations
                placed={previewPlaced}
                topics={model.topics}
                links={showLinks ? model.links : []}
                lookup={lookup}
                sources={model.sources.get(previewPlaced.item.ref) ?? []}
                usedBy={model.usedBy.get(previewPlaced.item.ref) ?? []}
                onGo={(ref) => goTo(ref, true)}
                onFollow={follow}
              />
              <ItemActions
                item={previewPlaced.item}
                onRead={() => openReader(previewPlaced.item.ref)}
                onReview={() => {
                  setPreview(null);
                  onReview(previewPlaced.item.mapId, previewPlaced.item.id);
                }}
                onAssignment={() =>
                  previewPlaced.item.assignment &&
                  setAssignmentOpen(previewPlaced.item.assignment)
                }
              />
              {preview?.pinned && (
                <div
                  role="toolbar"
                  aria-label={`Actions for ${previewPlaced.item.title}`}
                  className="mt-2 flex flex-wrap items-center gap-1 text-xs"
                >
                  <button
                    type="button"
                    className={toolbarButton}
                    onClick={() => {
                      const ref = previewPlaced.item.ref;
                      // linking picks a target card, and cards only exist zoomed in
                      if (deckMode) goTo(ref);
                      setConnect({ from: ref, to: null, label: "" });
                      setPreview(null);
                    }}
                  >
                    Link to…
                  </button>
                  {!previewPlaced.item.assignment && (
                    <Link
                      className={toolbarButton}
                      href={`/chat?noteId=${previewPlaced.item.id}&noteTitle=${encodeURIComponent(previewPlaced.item.title || "Untitled")}`}
                    >
                      Chat
                    </Link>
                  )}
                  <button
                    type="button"
                    className={toolbarButton}
                    aria-pressed={Boolean(previewPin?.pinned)}
                    onClick={() => togglePin(previewPlaced.item.ref)}
                  >
                    {previewPin?.pinned ? "Unpin" : "Pin"}
                  </button>
                  {previewPin && !previewPin.pinned && (
                    <button
                      type="button"
                      className={toolbarButton}
                      onClick={() => resetPosition(previewPlaced.item.ref)}
                    >
                      Reset
                    </button>
                  )}
                  <label className="flex items-center gap-1 px-1 text-text-secondary">
                    <span className="sr-only">Week</span>
                    <select
                      className="min-h-7 rounded-radius-md border border-border-subtle bg-surface px-1 text-xs text-text"
                      value={
                        previewPlaced.item.weekSource === "set"
                          ? String(previewPlaced.item.week ?? 0)
                          : "detected"
                      }
                      onChange={(event) =>
                        setWeek(previewPlaced.item.ref, event.target.value)
                      }
                      title="Teaching week"
                    >
                      <option value="detected">
                        {previewPlaced.item.weekSource === "set"
                          ? "Use detected week"
                          : `Detected: ${previewPlaced.item.week === null ? "no week" : `week ${previewPlaced.item.week}`}`}
                      </option>
                      <option value="0">No week</option>
                      {weekOptions(previewPlaced).map((week) => (
                        <option key={week} value={String(week)}>
                          Week {week}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {previewPlaced.item.copies?.length ? (
                <div className="mt-3 border-t border-[var(--study-glass-edge)] pt-2 text-xs text-text-secondary">
                  <p>Also here, same file:</p>
                  <ul className="mt-1 space-y-1">
                    {previewPlaced.item.copies.map((copy) => (
                      <li
                        key={copy.noteId}
                        className="flex min-w-0 items-center gap-2"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {copy.title}
                        </span>
                        <button
                          type="button"
                          className="shrink-0 text-primary-700 hover:underline dark:text-primary-300"
                          onClick={() =>
                            splitOut(
                              previewPlaced.item.ref,
                              `note:${copy.noteId}`,
                            )
                          }
                        >
                          Split out
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}

          <div
            data-flow-overlay
            className={`absolute bottom-3 right-3 z-30 ${islandClass}`}
          >
            {saveStatus}
            <button
              type="button"
              className={iconButton}
              onClick={() => zoomBy(0.8)}
              aria-label="Zoom out"
            >
              <MinusIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <span
              className="min-w-12 text-center text-xs tabular-nums text-text-tertiary"
              aria-live="off"
            >
              {Math.round(view.z * 100)}%
            </span>
            <button
              type="button"
              className={iconButton}
              onClick={() => zoomBy(1.25)}
              aria-label="Zoom in"
            >
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={iconButton}
              onClick={fit}
              aria-label="Fit everything"
            >
              <ArrowsPointingOutIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {model.ordered.length === 0 && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <p className="max-w-sm text-sm text-text-secondary">
                Add notes, slides or files to this module and they will appear
                here, grouped by topic.
              </p>
            </div>
          )}
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>
        </div>

        <div className="pointer-events-none absolute right-3 top-3 z-40 flex flex-col items-end gap-2 xl:flex-row-reverse xl:items-center">
          <div className={islandClass}>
            <button
              type="button"
              className={`${islandButton} sm:hidden`}
              aria-label="Search the map"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((open) => !open)}
            >
              <MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <label
              className={`relative items-center ${searchOpen ? "flex max-sm:absolute max-sm:right-0 max-sm:top-full max-sm:mt-2 max-sm:w-[calc(100vw-1.5rem)] max-sm:rounded-radius-lg max-sm:border max-sm:border-border-subtle max-sm:bg-surface max-sm:p-1 max-sm:shadow-md" : "hidden sm:flex"}`}
            >
              <span className="sr-only">Search the map</span>
              <MagnifyingGlassIcon
                className="pointer-events-none absolute left-2.5 h-4 w-4 text-text-tertiary max-sm:left-3.5"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                autoFocus={searchOpen}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    // a first Escape clears the search, a second closes whatever is open
                    if (query) event.preventDefault();
                    else setSearchOpen(false);
                    setQuery("");
                  }
                  if (event.key !== "Enter" || !lowerQuery) return;
                  const topic = [...model.topics.values()].find((entry) =>
                    entry.name.toLocaleLowerCase().startsWith(lowerQuery),
                  );
                  if (topic) follow(topic.id);
                  else {
                    const match = model.ordered.find((placed) =>
                      matchesQuery(placed, lowerQuery, model.topics),
                    );
                    if (match) goTo(match.item.ref, true);
                  }
                }}
                placeholder="Search notes and topics"
                className="min-h-8 w-full rounded-radius-md bg-background/70 py-1 pl-8 pr-2 text-base text-text placeholder:text-text-tertiary focus-visible:outline-2 focus-visible:outline-primary-500 sm:w-44 md:text-sm lg:w-56"
              />
            </label>
            <Popover>
              <PopoverButton
                className={islandButton}
                title="Choose which cards and relations to show"
              >
                <AdjustmentsHorizontalIcon
                  className="h-4 w-4"
                  aria-hidden="true"
                />
                <span className="max-sm:sr-only">
                  Show{filtered ? " (filtered)" : ""}
                </span>
                {filtered && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-primary-500 sm:hidden"
                    aria-hidden="true"
                  />
                )}
              </PopoverButton>
              <PopoverPanel
                anchor="bottom end"
                className="z-[60] w-60 rounded-radius-lg border border-border-subtle bg-surface p-3 text-sm text-text shadow-lg [--anchor-gap:8px] [--anchor-padding:8px] focus:outline-none"
              >
                <fieldset>
                  <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                    Cards
                  </legend>
                  {FILTERS.map(([key, label]) => (
                    <label
                      key={key}
                      className="flex min-h-8 items-center gap-2"
                    >
                      <input
                        type="checkbox"
                        checked={!hidden.has(key)}
                        onChange={(event) =>
                          setHidden((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.delete(key);
                            else next.add(key);
                            return next;
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <fieldset className="mt-2 border-t border-border-subtle pt-2">
                  <legend className="sr-only">Relations</legend>
                  <label className="flex min-h-8 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showSuggested}
                      onChange={(event) =>
                        setShowSuggested(event.target.checked)
                      }
                    />{" "}
                    Suggested topics
                  </label>
                  <label className="flex min-h-8 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showLinks}
                      onChange={(event) => setShowLinks(event.target.checked)}
                    />{" "}
                    Links between notes
                  </label>
                </fieldset>
              </PopoverPanel>
            </Popover>
            <button
              type="button"
              className={islandButton}
              onClick={tidy}
              title="Put moved cards back in their topic clusters"
            >
              <Squares2X2Icon
                className="h-4 w-4 sm:hidden"
                aria-hidden="true"
              />
              <span className="max-sm:sr-only">Tidy layout</span>
            </button>
            {actions}
          </div>
          {/* the phone search box drops into the same spot */}
          {status && (
            <div className={searchOpen ? "max-sm:hidden" : undefined}>
              {status}
            </div>
          )}
        </div>
        <NoticeStack>{notices}</NoticeStack>
      </div>

      {readerPlaced && (
        <aside
          aria-label={`Reading ${readerPlaced.item.title}`}
          className="flex w-full max-w-[460px] shrink-0 flex-col border-l border-border-subtle bg-surface max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-50 max-lg:shadow-2xl"
        >
          <div className="flex items-start gap-2 border-b border-border-subtle px-4 py-3">
            <div className="min-w-0 flex-1">
              <ItemHeader placed={readerPlaced} />
            </div>
            <button
              type="button"
              className="rounded-radius-md p-1.5 text-text-tertiary hover:bg-primary-500/5 hover:text-text"
              onClick={() => setReader(null)}
              aria-label="Close reader"
            >
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <ItemActions
              item={readerPlaced.item}
              onReview={() =>
                onReview(readerPlaced.item.mapId, readerPlaced.item.id)
              }
              onAssignment={() =>
                readerPlaced.item.assignment &&
                setAssignmentOpen(readerPlaced.item.assignment)
              }
            >
              <button
                type="button"
                className={secondarySmall}
                onClick={() => goTo(readerPlaced.item.ref)}
              >
                Show on map
              </button>
            </ItemActions>
            <div className="mt-3">
              <ItemBody item={readerPlaced.item} full />
            </div>
            <div className="mt-3 border-t border-border-subtle pt-1">
              <ItemRelations
                placed={readerPlaced}
                topics={model.topics}
                links={model.links}
                lookup={lookup}
                sources={model.sources.get(readerPlaced.item.ref) ?? []}
                usedBy={model.usedBy.get(readerPlaced.item.ref) ?? []}
                onGo={(ref) => {
                  setReader(ref.startsWith("note:") ? ref : null);
                  goTo(ref, !ref.startsWith("note:"));
                }}
                onFollow={follow}
              />
            </div>
          </div>
        </aside>
      )}
      {assignmentOpen && (
        <AssignmentDetails
          assignment={assignmentOpen}
          onClose={() => setAssignmentOpen(null)}
        />
      )}
    </div>
  );
}
