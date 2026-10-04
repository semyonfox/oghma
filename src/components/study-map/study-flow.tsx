"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  AdjustmentsHorizontalIcon,
  ArrowsPointingOutIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import AssignmentDetails from "@/components/assignments/assignment-details";
import { summariseExamCorpus } from "@/lib/study-map/exam-stats";
import {
  assignmentSources,
  CARD_WIDTH,
  flowLinks,
  LEGEND_WIDTH,
  layoutModule,
  MODULE_GAP,
  MODULE_HEADER,
  moduleItems,
  topicBridges,
  topicTrail,
  type FlowItem,
  type FlowLink,
  type ModuleLayout,
  type TopicBridge,
} from "@/lib/study-map/flow";
import type { StudyAssignment, StudyBoard, StudyMapSnapshot } from "@/lib/study-map/types";
import { StudyFlowCard, readableExcerpt } from "./study-board-card";
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
  toolbar?: ReactNode;
  onBoardChange: (mapId: string, board: StudyBoard) => void;
  onReview: (mapId: string, noteId: string) => void;
  onOpenModule: (mapId: string) => void;
  /** topic outside the loaded modules, offered when following a bridge */
  onShowAllModules?: () => void;
}

const TOPIC_COLOURS = ["#6366f1", "#0d9488", "#0284c7", "#a855f7", "#059669", "#e11d48", "#ea580c", "#db2777", "#65a30d", "#0891b2"];
const COMPACT_ZOOM = 0.42;
const FAR_ZOOM = 0.24;
const MIN_ZOOM = 0.06;
const MAX_ZOOM = 1.8;
const CULL_THRESHOLD = 260;
const LINK_LABELS = ["builds on", "example of", "contrasts with", "same idea", "needed for"];
const toolbarButton = "inline-flex min-h-7 items-center whitespace-nowrap rounded-radius-md px-2 text-xs font-medium text-text-secondary hover:bg-primary-500/10 hover:text-text focus-visible:outline-2 focus-visible:outline-primary-500";
const iconButton = "grid h-8 w-8 place-items-center rounded-radius-md text-text-secondary hover:bg-primary-500/10 hover:text-text focus-visible:outline-2 focus-visible:outline-primary-500";

type Camera = { x: number; y: number; z: number };
type FilterKey = "lectures" | "slides" | "worked" | "readings" | "files" | "mine" | "assignments";
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
}

interface Placed extends PlacedItem {
  module: ModuleModel;
  x: number;
  y: number;
}

interface Model {
  modules: ModuleModel[];
  byRef: Map<string, Placed>;
  ordered: Placed[];
  links: FlowLink[];
  bridges: TopicBridge[];
  topics: Map<string, ColouredTopic>;
  linkCount: Map<string, number>;
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

function examLines(snapshot: StudyMapSnapshot): Map<string, string> {
  const versions = [...new Set(snapshot.papers.map((paper) => paper.structure.syllabusVersion))];
  if (!versions.length) return new Map();
  // the module's own academic year is the syllabus most worth comparing against
  const version = versions.includes(snapshot.map.academicYear) ? snapshot.map.academicYear : versions.sort().at(-1)!;
  const summary = summariseExamCorpus(snapshot.papers.filter((paper) => paper.structure.syllabusVersion === version), snapshot.map.topics, snapshot.map.taxonomyVersion, version);
  if (!summary.eligibleCount) return new Map();
  return new Map(summary.topics.map((row) => [row.topicId, `In ${row.paperCount} of ${summary.eligibleCount} reviewed ${summary.eligibleCount === 1 ? "paper" : "papers"} (${version})`]));
}

function buildModel(modules: FlowModule[]): Model {
  let originY = 0;
  const models: ModuleModel[] = modules.map(({ snapshot, board }) => {
    const items = moduleItems(snapshot, board);
    const layout = layoutModule(snapshot.map.id, snapshot.map.topics, items, board.placements);
    const exams = examLines(snapshot);
    const model: ModuleModel = {
      mapId: snapshot.map.id,
      name: snapshot.map.name,
      year: snapshot.map.academicYear,
      snapshot,
      board,
      items,
      layout,
      topics: snapshot.map.topics.map((topic, index) => ({ ...topic, colour: TOPIC_COLOURS[index % TOPIC_COLOURS.length], mapId: snapshot.map.id, exam: exams.get(topic.id) ?? null })),
      originY,
      syllabusCount: snapshot.materials.filter((material) => material.kind === "syllabus").length,
      paperCount: snapshot.materials.filter((material) => material.kind === "past_paper").length,
    };
    originY += layout.height + MODULE_GAP;
    return model;
  });
  const byRef = new Map<string, Placed>();
  for (const module of models) {
    for (const item of module.items) {
      const position = module.layout.positions.get(item.ref);
      if (position) byRef.set(item.ref, { item, module, moduleName: module.name, x: position.x, y: module.originY + position.y });
    }
  }
  // tab order follows modules, then weeks, then height
  const ordered = [...byRef.values()].sort((a, b) => a.module.originY - b.module.originY
    || (a.item.week ?? 99) - (b.item.week ?? 99) || a.y - b.y);
  const links = flowLinks(models.map((module) => ({ items: module.items, board: module.board })));
  const bridges = models.length > 1 ? topicBridges(models.map((module) => ({ mapId: module.mapId, topics: module.topics, items: module.items })), links) : [];
  const linkCount = new Map<string, number>();
  for (const link of links) for (const ref of [link.source, link.target]) linkCount.set(ref, (linkCount.get(ref) ?? 0) + 1);
  const usedBy = new Map<string, FlowItem[]>();
  const sources = new Map<string, FlowItem[]>();
  for (const module of models) {
    for (const item of module.items) {
      if (item.kind !== "assignment") continue;
      const list = assignmentSources(item, module.items);
      sources.set(item.ref, list);
      for (const source of list) usedBy.set(source.ref, [...(usedBy.get(source.ref) ?? []), item]);
    }
  }
  return {
    modules: models,
    byRef,
    ordered,
    links,
    bridges,
    topics: new Map(models.flatMap((module) => module.topics.map((topic) => [topic.id, topic] as const))),
    linkCount,
    usedBy,
    sources,
    width: Math.max(1200, ...models.map((module) => module.layout.width)),
    height: Math.max(0, originY - MODULE_GAP),
  };
}

function connector(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
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
    mid: { x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8, y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8 },
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

const rectOf = (placed: Placed) => ({ x: placed.x, y: placed.y, w: CARD_WIDTH, h: placed.item.height });
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function matchesQuery(placed: Placed, query: string, topics: Map<string, ColouredTopic>): boolean {
  if (!query) return true;
  const { item } = placed;
  const haystack = [item.title, item.material?.excerpt ?? "", readableExcerpt(item.assignment?.description ?? ""),
    ...item.tags.map((tag) => topics.get(tag.topicId)?.name ?? "")].join(" ").toLocaleLowerCase();
  return haystack.includes(query);
}

interface CardLayerProps {
  placed: Placed[];
  topics: Map<string, ColouredTopic>;
  linkCount: Map<string, number>;
  usedBy: Map<string, FlowItem[]>;
  compact: boolean;
  far: boolean;
  state: Map<string, string>;
  stops: Map<string, number>;
  focusColour: string | null;
}

const CardLayer = memo(function CardLayer({ placed, topics, linkCount, usedBy, compact, far, state, stops, focusColour }: CardLayerProps) {
  return (
    <>
      {placed.map(({ item, module, x, y }) => {
        const flags = state.get(item.ref) ?? "";
        const pinned = module.board.placements.some((placement) => placement.id === item.ref && placement.pinned);
        const stop = stops.get(item.ref);
        const primary = item.tags[0] ? topics.get(item.tags[0].topicId) : undefined;
        return (
          <article
            key={item.ref}
            data-card={item.ref}
            tabIndex={0}
            aria-label={`${item.title || "Untitled"}, ${item.week === null ? "no week" : `week ${item.week}`}, ${module.name}`}
            className={`absolute rounded-radius-lg outline-2 outline-offset-2 transition-[opacity,box-shadow] duration-150 focus-visible:outline focus-visible:outline-primary-500 ${flags.includes("selected") ? "outline outline-primary-500" : ""} ${flags.includes("related") ? "shadow-[0_0_0_2px_var(--color-primary-400)]" : ""} ${flags.includes("dim") ? "opacity-15" : ""} ${flags.includes("supporting") ? "outline-dashed outline-primary-400/70" : ""} ${flags.includes("flash") ? "animate-pulse" : ""}`}
            style={{ left: x, top: y, width: CARD_WIDTH, height: item.height, cursor: pinned ? "default" : "grab" }}
          >
            {far ? (
              <div className="h-full w-full rounded-radius-lg" style={{ background: primary?.colour ?? "var(--color-text-tertiary)", opacity: 0.45 }} />
            ) : (
              <StudyFlowCard
                item={item}
                topics={topics}
                linkCount={linkCount.get(item.ref) ?? 0}
                usedBy={(usedBy.get(item.ref) ?? []).map((assignment) => ({ id: assignment.id, short: shortName(assignment.title), title: assignment.title }))}
                compact={compact}
                pinned={pinned}
              />
            )}
            {stop !== undefined && (
              <span className="absolute -left-3 -top-3 grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-white shadow ring-2 ring-background" style={{ background: focusColour ?? "var(--color-primary-600)" }}>
                {stop + 1}
              </span>
            )}
          </article>
        );
      })}
    </>
  );
});

function shortName(title: string): string {
  const numbered = /(assignment|project|lab|quiz|homework|coursework|ca)\s*([0-9]+)/i.exec(title);
  if (numbered) return `${numbered[1][0].toUpperCase()}${numbered[2]}`;
  return title.split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("");
}

export default function StudyFlow({ modules, viewKey, toolbar, onBoardChange, onReview, onOpenModule, onShowAllModules }: StudyFlowProps) {
  const model = useMemo(() => buildModel(modules), [modules]);
  const boardRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const camera = useRef<Camera>({ x: 40, y: 20, z: 0.7 });
  const [view, setView] = useState<Camera & { w: number; h: number }>({ x: 40, y: 20, z: 0.7, w: 1200, h: 800 });
  const frame = useRef(0);
  const animation = useRef(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoverTopic, setHoverTopic] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ ref: string; pinned: boolean } | null>(null);
  const previewTimer = useRef(0);
  const leaveTimer = useRef(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [reader, setReader] = useState<string | null>(null);
  const [assignmentOpen, setAssignmentOpen] = useState<StudyAssignment | null>(null);
  const [focus, setFocus] = useState<{ topicId: string; stop: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<FilterKey>>(new Set());
  const [showSuggested, setShowSuggested] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [query, setQuery] = useState("");
  const [connect, setConnect] = useState<{ from: string; to: string | null; label: string } | null>(null);
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
  const dragPosition = useRef<{ ref: string; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<{ ref: string; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const apply = useCallback(() => {
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
      setView({ ...camera.current, w: board.clientWidth, h: board.clientHeight });
    });
  }, []);

  const flyTo = useCallback((target: Camera, ms = 380) => {
    cancelAnimationFrame(animation.current);
    if (reducedMotion() || ms === 0) {
      camera.current = target;
      apply();
      return;
    }
    const from = { ...camera.current };
    const start = performance.now();
    const step = (now: number) => {
      const t = clamp((now - start) / ms, 0, 1);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const z = Math.exp(Math.log(from.z) + (Math.log(target.z) - Math.log(from.z)) * ease);
      // interpolate the world point at the screen centre so zooming feels anchored
      const board = boardRef.current;
      const w = board?.clientWidth ?? 1200;
      const h = board?.clientHeight ?? 800;
      const fromCentre = { x: (w / 2 - from.x) / from.z, y: (h / 2 - from.y) / from.z };
      const toCentre = { x: (w / 2 - target.x) / target.z, y: (h / 2 - target.y) / target.z };
      const cx = fromCentre.x + (toCentre.x - fromCentre.x) * ease;
      const cy = fromCentre.y + (toCentre.y - fromCentre.y) * ease;
      camera.current = { x: w / 2 - cx * z, y: h / 2 - cy * z, z };
      apply();
      if (t < 1) animation.current = requestAnimationFrame(step);
    };
    animation.current = requestAnimationFrame(step);
  }, [apply]);

  const frameRect = useCallback((rect: { x: number; y: number; w: number; h: number }, maxZoom = 1, padding = 48, leftInset = 0) => {
    const board = boardRef.current;
    const w = (board?.clientWidth ?? 1200) - leftInset;
    const h = board?.clientHeight ?? 800;
    const z = clamp(Math.min((w - padding * 2) / rect.w, (h - padding * 2) / rect.h), MIN_ZOOM, maxZoom);
    return { x: leftInset + w / 2 - (rect.x + rect.w / 2) * z, y: h / 2 - (rect.y + rect.h / 2) * z, z };
  }, []);

  const fit = useCallback(() => {
    flyTo(frameRect({ x: 0, y: 0, w: model.width, h: Math.max(model.height, 400) }, 1));
  }, [flyTo, frameRect, model.height, model.width]);

  const zoomBy = useCallback((factor: number, sx?: number, sy?: number) => {
    const board = boardRef.current;
    if (!board) return;
    const px = sx ?? board.clientWidth / 2;
    const py = sy ?? board.clientHeight / 2;
    const { x, y, z } = camera.current;
    const next = clamp(z * factor, MIN_ZOOM, MAX_ZOOM);
    camera.current = { x: px - ((px - x) / z) * next, y: py - ((py - y) / z) * next, z: next };
    apply();
  }, [apply]);

  // restore the last camera for this scope, otherwise start on the first weeks at a readable size
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    let restored: Camera | null = null;
    try {
      const raw = window.sessionStorage.getItem(`oghma-study-flow-camera:${viewKey}`);
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (value && typeof value === "object" && "x" in value && "y" in value && "z" in value
          && typeof value.x === "number" && typeof value.y === "number" && typeof value.z === "number") {
          restored = { x: value.x, y: value.y, z: clamp(value.z, MIN_ZOOM, MAX_ZOOM) };
        }
      }
    } catch {
      restored = null;
    }
    const first = model.modules[0];
    const start = first ? frameRect({ x: 0, y: 0, w: Math.min(first.layout.width, LEGEND_WIDTH + 3.4 * 284), h: Math.min(first.layout.height, 900) }, 0.85, 16) : null;
    // a phone shows a couple of readable columns and pans, rather than a whole unreadable module
    camera.current = restored ?? (start && start.z < 0.5 ? { x: 8, y: 8 - (MODULE_HEADER - 70) * 0.5, z: 0.5 } : start ?? { x: 40, y: 20, z: 0.7 });
    apply();
    // only the scope decides where the camera starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);

  useEffect(() => {
    const save = () => {
      try {
        window.sessionStorage.setItem(`oghma-study-flow-camera:${viewKey}`, JSON.stringify(camera.current));
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
    const observer = new ResizeObserver(() => apply());
    observer.observe(board);
    return () => observer.disconnect();
  }, [apply]);

  useEffect(() => () => {
    cancelAnimationFrame(frame.current);
    cancelAnimationFrame(animation.current);
    window.clearTimeout(previewTimer.current);
    window.clearTimeout(leaveTimer.current);
  }, []);

  // wheel must be non-passive to keep the page from scrolling under the canvas
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const onWheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-flow-overlay]")) return;
      event.preventDefault();
      cancelAnimationFrame(animation.current);
      const rect = board.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        zoomBy(Math.exp(-event.deltaY * (event.ctrlKey && !event.metaKey && Math.abs(event.deltaY) < 30 ? 0.012 : 0.002)), event.clientX - rect.left, event.clientY - rect.top);
        return;
      }
      const unit = event.deltaMode === 1 ? 16 : 1;
      camera.current = {
        ...camera.current,
        x: camera.current.x - (event.shiftKey ? event.deltaY : event.deltaX) * unit,
        y: camera.current.y - (event.shiftKey ? 0 : event.deltaY) * unit,
      };
      apply();
    };
    board.addEventListener("wheel", onWheel, { passive: false });
    return () => board.removeEventListener("wheel", onWheel);
  }, [apply, zoomBy]);

  const compact = view.z < COMPACT_ZOOM;
  const far = view.z < FAR_ZOOM;
  const lowerQuery = query.trim().toLocaleLowerCase();

  const visible = useCallback((placed: Placed) => !hidden.has(filterKey(placed.item)), [hidden]);
  const tagsShown = useCallback((item: FlowItem) => (showSuggested ? item.tags : item.tags.filter((tag) => !tag.suggested)), [showSuggested]);

  const trail = useMemo(() => {
    if (!focus) return [];
    const topic = model.topics.get(focus.topicId);
    const module = model.modules.find((entry) => entry.mapId === topic?.mapId);
    if (!topic || !module) return [];
    return topicTrail(focus.topicId, module.items.filter((item) => {
      const placed = model.byRef.get(item.ref);
      return placed && visible(placed) && tagsShown(item).some((tag) => tag.topicId === focus.topicId);
    }), module.layout);
  }, [focus, model, tagsShown, visible]);

  const related = useMemo(() => {
    const active = hovered ?? selected;
    const set = new Set<string>();
    if (!active) return set;
    for (const link of model.links) {
      if (link.source === active) set.add(link.target);
      if (link.target === active) set.add(link.source);
    }
    for (const item of model.sources.get(active) ?? []) set.add(item.ref);
    for (const item of model.usedBy.get(active) ?? []) set.add(item.ref);
    return set;
  }, [hovered, model, selected]);

  const cardState = useMemo(() => {
    const state = new Map<string, string>();
    const trailRefs = new Set(trail.map((item) => item.ref));
    for (const placed of model.ordered) {
      const flags: string[] = [];
      const { ref } = placed.item;
      if (ref === selected) flags.push("selected");
      if (related.has(ref)) flags.push("related");
      if (ref === flash) flags.push("flash");
      if (lowerQuery && !matchesQuery(placed, lowerQuery, model.topics)) flags.push("dim");
      if (focus && !trailRefs.has(ref)) {
        const touches = tagsShown(placed.item).some((tag) => tag.topicId === focus.topicId);
        flags.push(touches ? "supporting" : "dim");
      }
      if (connect && placed.item.mapId !== model.byRef.get(connect.from)?.item.mapId) flags.push("dim");
      if (flags.length) state.set(ref, flags.join(" "));
    }
    return state;
  }, [connect, flash, focus, lowerQuery, model, related, selected, tagsShown, trail]);

  const stops = useMemo(() => new Map(trail.map((item, index) => [item.ref, index])), [trail]);

  const positioned = useMemo(() => model.ordered.filter(visible).map((placed) => (
    dragging?.ref === placed.item.ref ? { ...placed, x: dragging.x, y: dragging.y } : placed
  )), [dragging, model.ordered, visible]);

  const culled = useMemo(() => {
    if (positioned.length <= CULL_THRESHOLD) return positioned;
    const margin = 600 / view.z;
    const left = -view.x / view.z - margin;
    const top = -view.y / view.z - margin;
    const right = left + view.w / view.z + margin * 2;
    const bottom = top + view.h / view.z + margin * 2;
    return positioned.filter((placed) => placed.item.ref === selected || (placed.x + CARD_WIDTH > left && placed.x < right && placed.y + placed.item.height > top && placed.y < bottom));
  }, [positioned, selected, view]);

  const positionOf = useCallback((ref: string) => positioned.find((placed) => placed.item.ref === ref), [positioned]);

  const goTo = useCallback((ref: string, open = false) => {
    const placed = model.byRef.get(ref);
    if (!placed) return;
    if (!visible(placed)) {
      setHidden((current) => {
        const next = new Set(current);
        next.delete(filterKey(placed.item));
        return next;
      });
    }
    if (focus && !tagsShown(placed.item).some((tag) => tag.topicId === focus.topicId)) setFocus(null);
    const board = boardRef.current;
    const z = Math.max(camera.current.z, 0.75);
    const w = board?.clientWidth ?? 1200;
    const h = board?.clientHeight ?? 800;
    flyTo({ x: w / 2 - (placed.x + CARD_WIDTH / 2) * z, y: h / 2 - (placed.y + placed.item.height / 2) * z, z });
    setSelected(ref);
    setFlash(ref);
    window.setTimeout(() => setFlash((current) => (current === ref ? null : current)), 1200);
    setAnnouncement(`Showing ${placed.item.title}`);
    window.setTimeout(() => boardRef.current?.querySelector<HTMLElement>(`[data-card="${ref}"]`)?.focus({ preventScroll: true }), 420);
    if (open) setPreview({ ref, pinned: true });
  }, [flyTo, focus, model.byRef, tagsShown, visible]);

  const follow = useCallback((topicId: string) => {
    const topic = model.topics.get(topicId);
    if (!topic) {
      onShowAllModules?.();
      return;
    }
    setPreview(null);
    setFocus({ topicId, stop: 0 });
    const module = model.modules.find((entry) => entry.mapId === topic.mapId);
    if (!module) return;
    const items = topicTrail(topicId, module.items, module.layout).map((item) => model.byRef.get(item.ref)).filter((placed): placed is Placed => Boolean(placed));
    const row = module.layout.rows.find((entry) => entry.key === topicId);
    const rects = [...items.map(rectOf), ...(row ? [{ x: 0, y: module.originY + row.y - 40, w: LEGEND_WIDTH, h: 80 }] : [])];
    if (!rects.length) return;
    const x = Math.min(...rects.map((rect) => rect.x));
    const y = Math.min(...rects.map((rect) => rect.y));
    const width = Math.max(...rects.map((rect) => rect.x + rect.w)) - x;
    const height = Math.max(...rects.map((rect) => rect.y + rect.h)) - y;
    flyTo(frameRect({ x, y, w: width, h: height }, 0.9, 40, 340));
    setAnnouncement(`Following ${topic.name}: ${items.length} ${items.length === 1 ? "stop" : "stops"}`);
  }, [flyTo, frameRect, model, onShowAllModules]);

  const step = useCallback((index: number) => {
    if (!focus || !trail.length) return;
    const next = clamp(index, 0, trail.length - 1);
    setFocus({ ...focus, stop: next });
    goTo(trail[next].ref);
  }, [focus, goTo, trail]);

  // board edits
  const moduleOf = useCallback((ref: string) => model.byRef.get(ref)?.module, [model.byRef]);
  const updateBoard = useCallback((ref: string, change: (board: StudyBoard) => StudyBoard) => {
    const module = moduleOf(ref);
    if (!module) return;
    onBoardChange(module.mapId, change(module.board));
  }, [moduleOf, onBoardChange]);

  const place = useCallback((ref: string, x: number, y: number) => {
    updateBoard(ref, (board) => {
      const module = moduleOf(ref)!;
      const existing = board.placements.find((placement) => placement.id === ref);
      const placement = { id: ref, x: Math.round(x / 8) * 8, y: Math.round((y - module.originY) / 8) * 8, pinned: existing?.pinned ?? false, topicId: null };
      return { ...board, placements: [...board.placements.filter((entry) => entry.id !== ref), placement] };
    });
  }, [moduleOf, updateBoard]);

  const togglePin = useCallback((ref: string) => {
    const placed = model.byRef.get(ref);
    if (!placed) return;
    const existing = placed.module.board.placements.find((placement) => placement.id === ref);
    updateBoard(ref, (board) => ({
      ...board,
      placements: [
        ...board.placements.filter((entry) => entry.id !== ref),
        { id: ref, x: existing?.x ?? placed.x, y: existing?.y ?? placed.y - placed.module.originY, pinned: !existing?.pinned, topicId: null },
      ],
    }));
    setAnnouncement(existing?.pinned ? "Unpinned" : "Pinned in place");
  }, [model.byRef, updateBoard]);

  const resetPosition = useCallback((ref: string) => {
    updateBoard(ref, (board) => ({ ...board, placements: board.placements.filter((entry) => entry.id !== ref) }));
    setAnnouncement("Back in its week and topic position");
  }, [updateBoard]);

  const setWeek = useCallback((ref: string, value: string) => {
    updateBoard(ref, (board) => {
      const weeks = { ...board.weeks };
      if (value === "detected") delete weeks[ref];
      else weeks[ref] = Number(value);
      // a new week means a new column, so drop any manual position from the old one
      return { ...board, weeks, placements: board.placements.filter((entry) => entry.id !== ref || entry.pinned) };
    });
  }, [updateBoard]);

  const tidy = useCallback(() => {
    let moved = 0;
    for (const module of model.modules) {
      const kept = module.board.placements.filter((placement) => placement.pinned);
      moved += module.board.placements.length - kept.length;
      if (kept.length !== module.board.placements.length) onBoardChange(module.mapId, { ...module.board, placements: kept });
    }
    setAnnouncement(moved ? `Tidied ${moved} ${moved === 1 ? "card" : "cards"}. Pinned cards stay put.` : "Everything is already in its week and topic position.");
  }, [model.modules, onBoardChange]);

  const saveLink = useCallback(() => {
    if (!connect?.to || !connect.label.trim()) return;
    const { from, to, label } = connect;
    updateBoard(from, (board) => ({ ...board, links: [...board.links, { id: crypto.randomUUID(), source: from, target: to, label: label.trim().slice(0, 80) }] }));
    setConnect(null);
    setAnnouncement(`Linked: ${label.trim()}`);
  }, [connect, updateBoard]);

  const removeLink = useCallback((link: FlowLink) => {
    updateBoard(link.source, (board) => ({ ...board, links: board.links.filter((entry) => entry.id !== link.id) }));
    setAnnouncement("Link removed");
  }, [updateBoard]);

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
      gesture.current = { kind: "pinch", startX: (a.x + b.x) / 2, startY: (a.y + b.y) / 2, camera: { ...camera.current }, moved: true, distance: Math.hypot(a.x - b.x, a.y - b.y) };
      dragPosition.current = null;
      setDragging(null);
      return;
    }
    if (target?.closest("button, a, input, select, textarea")) return;
    const card = target?.closest<HTMLElement>("[data-card]");
    const ref = card?.dataset.card;
    const placed = ref ? model.byRef.get(ref) : undefined;
    const pinned = placed?.module.board.placements.some((entry) => entry.id === ref && entry.pinned);
    // on touch, a card moves only once selected; otherwise one finger pans
    const movable = placed && !pinned && !connect && event.button === 0 && (event.pointerType !== "touch" || selected === ref);
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

  function onPointerMove(event: PointerEvent | ReactPointerEvent<HTMLDivElement>) {
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, boardPoint(event));
    const current = gesture.current;
    if (!current) return;
    if (current.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const z = clamp(current.camera.z * (distance / (current.distance || distance)), MIN_ZOOM, MAX_ZOOM);
      const wx = (current.startX - current.camera.x) / current.camera.z;
      const wy = (current.startY - current.camera.y) / current.camera.z;
      camera.current = { x: centre.x - wx * z, y: centre.y - wy * z, z };
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
      camera.current = { ...camera.current, x: current.camera.x + dx, y: current.camera.y + dy };
      apply();
    } else if (current.kind === "card" && current.ref && current.origin) {
      const next = { ref: current.ref, x: current.origin.x + dx / camera.current.z, y: current.origin.y + dy / camera.current.z };
      dragPosition.current = next;
      setDragging(next);
    }
  }

  function onPointerUp(event: PointerEvent | ReactPointerEvent<HTMLDivElement>) {
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
      setAnnouncement("Moved. Its week and topics are unchanged; Tidy layout puts it back.");
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
    const go = target.closest<HTMLElement>("[data-go]");
    if (go?.dataset.go) return goTo(go.dataset.go, true);
    const chip = target.closest<HTMLElement>("[data-topic]");
    if (chip?.dataset.topic) return follow(chip.dataset.topic);
    const legend = target.closest<HTMLElement>("[data-legend]");
    if (legend?.dataset.legend) {
      if (focus?.topicId === legend.dataset.legend) setFocus(null);
      else follow(legend.dataset.legend);
      return;
    }
    const open = target.closest<HTMLElement>("[data-open-module]");
    if (open?.dataset.openModule) return onOpenModule(open.dataset.openModule);
    const card = target.closest<HTMLElement>("[data-card]");
    const ref = card?.dataset.card;
    if (ref) {
      if (connect) {
        const from = model.byRef.get(connect.from);
        const to = model.byRef.get(ref);
        if (!from || !to || ref === connect.from) return;
        if (from.item.mapId !== to.item.mapId) {
          setAnnouncement("Links you draw stay inside one module. Note links across modules come from the notes themselves.");
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
    if (connect && !connect.to) setConnect(null);
  }

  function onDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;
    const ref = target?.closest<HTMLElement>("[data-card]")?.dataset.card;
    if (!ref || target?.closest("button, a")) return;
    openReader(ref);
  }

  function openReader(ref: string) {
    const placed = model.byRef.get(ref);
    if (!placed) return;
    setPreview(null);
    if (placed.item.assignment) setAssignmentOpen(placed.item.assignment);
    else setReader(ref);
  }

  function onPointerOver(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" || gesture.current?.moved) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-flow-overlay]")) {
      window.clearTimeout(leaveTimer.current);
      return;
    }
    const ref = target?.closest<HTMLElement>("[data-card]")?.dataset.card ?? null;
    const legend = target?.closest<HTMLElement>("[data-legend]")?.dataset.legend ?? null;
    if (legend !== hoverTopic) setHoverTopic(legend);
    if (ref === hovered) return;
    setHovered(ref);
    window.clearTimeout(previewTimer.current);
    window.clearTimeout(leaveTimer.current);
    if (ref && !compact) previewTimer.current = window.setTimeout(() => setPreview((current) => (current?.pinned && current.ref !== ref ? current : { ref, pinned: false })), 450);
    else leaveTimer.current = window.setTimeout(() => setPreview((current) => (current?.pinned ? current : null)), 250);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
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
        setPreview((current) => (current?.ref === ref ? null : { ref, pinned: true }));
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
        if (!placed || placed.module.board.placements.some((entry) => entry.id === ref && entry.pinned)) return;
        const delta = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key];
        if (delta) place(ref, placed.x + delta[0], placed.y + delta[1]);
        return;
      }
    }
    if (event.key === "Escape") {
      if (connect) setConnect(null);
      else if (preview) setPreview(null);
      else if (selected) setSelected(null);
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
    if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomBy(1.25); return; }
    if (event.key === "-" || event.key === "_") { event.preventDefault(); zoomBy(0.8); return; }
    if (event.key === "!" || (event.shiftKey && event.code === "Digit1")) { event.preventDefault(); fit(); return; }
    if (!ref && event.key.startsWith("Arrow")) {
      event.preventDefault();
      const delta = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[event.key];
      if (delta) {
        camera.current = { ...camera.current, x: camera.current.x + delta[0], y: camera.current.y + delta[1] };
        apply();
      }
    }
  }

  function onFocusCapture(event: ReactFocusEvent<HTMLDivElement>) {
    // keep keyboard focus visible by bringing an offscreen card into view
    const card = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-card]") : null;
    const ref = card?.dataset.card;
    const placed = ref ? model.byRef.get(ref) : undefined;
    const board = boardRef.current;
    if (!placed || !board || gesture.current) return;
    const { x, y, z } = camera.current;
    const sx = placed.x * z + x;
    const sy = placed.y * z + y;
    if (sx < 0 || sy < 0 || sx + CARD_WIDTH * z > board.clientWidth || sy + placed.item.height * z > board.clientHeight) {
      flyTo({ x: board.clientWidth / 2 - (placed.x + CARD_WIDTH / 2) * z, y: board.clientHeight / 2 - (placed.y + placed.item.height / 2) * z, z }, 200);
    }
  }

  // drags continue outside the board without capturing the pointer, which would retarget clicks
  const moveRef = useRef(onPointerMove);
  const upRef = useRef(onPointerUp);
  moveRef.current = onPointerMove;
  upRef.current = onPointerUp;
  useEffect(() => {
    const move = (event: PointerEvent) => moveRef.current(event);
    const up = (event: PointerEvent) => upRef.current(event);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  // geometry for links, ribbons and bridges
  const activeRef = hovered ?? selected;
  const svg = useMemo(() => {
    const under: ReactNode[] = [];
    const over: ReactNode[] = [];
    const labels: Array<{ key: string; x: number; y: number; text: string; link?: FlowLink; tone: "plain" | "cross" | "strong" }> = [];
    for (const module of model.modules) {
      for (const column of module.layout.columns) {
        under.push(<line key={`col-${module.mapId}-${column.week}`} x1={column.x} x2={column.x} y1={module.originY + MODULE_HEADER - 20} y2={module.originY + module.layout.height - 40} stroke="var(--color-border)" strokeDasharray="4 8" />);
      }
      for (const row of module.layout.rows) {
        if (!row.topic) continue;
        const items = topicTrail(row.topic.id, module.items, module.layout)
          .map((item) => positionOf(item.ref))
          .filter((placed): placed is Placed => Boolean(placed) && tagsShown(placed!.item).some((tag) => tag.topicId === row.topic!.id));
        if (!items.length) continue;
        const topic = model.topics.get(row.topic.id);
        const points = [{ x: LEGEND_WIDTH - 30, y: module.originY + row.y }, ...items.map((placed) => ({ x: placed.x + CARD_WIDTH / 2, y: placed.y + Math.min(placed.item.height / 2, 70) }))];
        const on = focus ? focus.topicId === row.topic.id : hoverTopic === row.topic.id;
        under.push(
          <path key={`ribbon-${row.topic.id}`} d={ribbon(points)} fill="none" stroke={topic?.colour} strokeWidth={on ? 46 : 36} strokeLinecap="round" strokeLinejoin="round" opacity={focus ? (on ? 0.3 : 0.04) : on ? 0.28 : 0.1} />,
        );
      }
    }
    if (showLinks) {
      for (const link of model.links) {
        const a = positionOf(link.source);
        const b = positionOf(link.target);
        if (!a || !b) continue;
        const geometry = connector(rectOf(a), rectOf(b));
        const cross = a.item.mapId !== b.item.mapId;
        const strong = activeRef === link.source || activeRef === link.target || (focus !== null && stops.has(link.source) && stops.has(link.target));
        const path = (
          <path key={link.id} d={geometry.d} fill="none" stroke={strong ? "var(--color-text-secondary)" : "var(--color-text-tertiary)"} strokeWidth={strong ? 2.4 : 1.4} strokeDasharray={cross ? "8 6" : link.origin === "note" ? undefined : "2 4"} opacity={strong ? 0.95 : focus || activeRef ? 0.12 : 0.45} markerEnd="url(#flow-arrow)" />
        );
        if (strong) {
          over.push(<path key={`${link.id}-halo`} d={geometry.d} fill="none" stroke="var(--color-background)" strokeWidth={8} opacity={0.8} />, path);
        } else under.push(path);
        if (strong || link.origin === "yours") labels.push({ key: link.id, x: geometry.mid.x, y: geometry.mid.y, text: link.label, link, tone: strong ? "strong" : cross ? "cross" : "plain" });
      }
    }
    if (activeRef && model.sources.has(activeRef)) {
      const assignment = positionOf(activeRef);
      for (const source of model.sources.get(activeRef) ?? []) {
        const placed = positionOf(source.ref);
        if (!assignment || !placed) continue;
        const geometry = connector(rectOf(placed), rectOf(assignment));
        over.push(<path key={`source-${source.ref}`} d={geometry.d} fill="none" stroke="var(--color-ai-500)" strokeWidth={2.2} strokeDasharray="2 5" strokeLinecap="round" markerEnd="url(#flow-arrow)" />);
      }
    }
    // topics linked across modules run down the left margin
    for (const bridge of model.bridges) {
      const ta = model.topics.get(bridge.a);
      const tb = model.topics.get(bridge.b);
      const ma = model.modules.find((module) => module.mapId === ta?.mapId);
      const mb = model.modules.find((module) => module.mapId === tb?.mapId);
      const ra = ma?.layout.rows.find((row) => row.key === bridge.a);
      const rb = mb?.layout.rows.find((row) => row.key === bridge.b);
      if (!ma || !mb || !ra || !rb) continue;
      const ya = ma.originY + ra.y;
      const yb = mb.originY + rb.y;
      const bend = -120 - Math.abs(yb - ya) * 0.05;
      const d = `M16,${ya} C${bend},${ya} ${bend},${yb} 16,${yb}`;
      const on = [bridge.a, bridge.b].includes(focus?.topicId ?? "") || [bridge.a, bridge.b].includes(hoverTopic ?? "");
      (on ? over : under).push(<path key={`bridge-${bridge.a}-${bridge.b}-${bridge.reason}`} d={d} fill="none" stroke="var(--color-text-tertiary)" strokeWidth={on ? 2.4 : 1.6} strokeDasharray="8 6" opacity={on ? 0.9 : focus ? 0.1 : 0.45} />);
      if (on) labels.push({ key: `bridge-${bridge.a}-${bridge.b}-${bridge.reason}`, x: bend * 0.75 + 4, y: (ya + yb) / 2, text: bridge.reason === "same name" ? "same topic name" : `${bridge.count} linked notes`, tone: "cross" });
    }
    return { under, over, labels };
  }, [activeRef, focus, hoverTopic, model, positionOf, showLinks, stops, tagsShown]);

  const previewPlaced = preview ? model.byRef.get(preview.ref) : undefined;
  const readerPlaced = reader ? model.byRef.get(reader) : undefined;
  const selectedPlaced = selected ? positionOf(selected) : undefined;
  const focusTopic = focus ? model.topics.get(focus.topicId) : undefined;
  const focusModule = focusTopic ? model.modules.find((module) => module.mapId === focusTopic.mapId) : undefined;
  const lookup = useCallback((ref: string) => model.byRef.get(ref), [model.byRef]);
  const toScreen = (x: number, y: number) => ({ x: x * view.z + view.x, y: y * view.z + view.y });

  const previewStyle = (() => {
    if (!previewPlaced) return undefined;
    const placed = positionOf(previewPlaced.item.ref) ?? previewPlaced;
    const topLeft = toScreen(placed.x, placed.y);
    const right = toScreen(placed.x + CARD_WIDTH, placed.y);
    const width = Math.min(360, view.w - 16);
    const left = right.x + 12 + width < view.w ? right.x + 12 : Math.max(8, topLeft.x - 12 - width);
    const height = Math.min(560, view.h - 16);
    const top = clamp(topLeft.y, 8, Math.max(8, view.h - height - 8));
    return { left, top, width, maxHeight: view.h - top - 8 };
  })();

  const weekOptions = (placed: Placed) => {
    const max = Math.max(14, ...placed.module.layout.columns.map((column) => column.week ?? 0)) + 2;
    return Array.from({ length: max }, (_, index) => index + 1);
  };

  const legendCount = (module: ModuleModel, topicId: string) => module.items.filter((item) => item.tags.some((tag) => tag.topicId === topicId && tag.relevance === "core")).length;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle bg-surface px-3 py-2">
        {toolbar}
        <label className="relative order-last flex min-w-0 basis-full items-center sm:order-none sm:ml-auto sm:max-w-xs sm:flex-1 sm:basis-auto">
          <span className="sr-only">Search the map</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 h-4 w-4 text-text-tertiary" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
              if (event.key !== "Enter" || !lowerQuery) return;
              const topic = [...model.topics.values()].find((entry) => entry.name.toLocaleLowerCase().startsWith(lowerQuery));
              if (topic) follow(topic.id);
              else {
                const match = model.ordered.find((placed) => matchesQuery(placed, lowerQuery, model.topics));
                if (match) goTo(match.item.ref, true);
              }
            }}
            placeholder="Search notes and topics"
            className="min-h-9 w-full rounded-radius-md border border-border-subtle bg-background py-1.5 pl-8 pr-3 text-base text-text placeholder:text-text-tertiary focus-visible:outline-2 focus-visible:outline-primary-500 md:text-sm"
          />
        </label>
        <div className="relative">
          <button type="button" className={secondarySmall} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>
            <AdjustmentsHorizontalIcon className="h-4 w-4" aria-hidden="true" />
            Show{hidden.size || !showSuggested || !showLinks ? " (filtered)" : ""}
          </button>
          {filtersOpen && (
            <div data-flow-overlay className="absolute right-0 top-10 z-40 w-60 rounded-radius-lg border border-border-subtle bg-surface p-3 text-sm shadow-lg">
              <fieldset>
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Cards</legend>
                {FILTERS.map(([key, label]) => (
                  <label key={key} className="flex min-h-8 items-center gap-2">
                    <input type="checkbox" checked={!hidden.has(key)} onChange={(event) => setHidden((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.delete(key);
                      else next.add(key);
                      return next;
                    })} />
                    {label}
                  </label>
                ))}
              </fieldset>
              <fieldset className="mt-2 border-t border-border-subtle pt-2">
                <legend className="sr-only">Relations</legend>
                <label className="flex min-h-8 items-center gap-2"><input type="checkbox" checked={showSuggested} onChange={(event) => setShowSuggested(event.target.checked)} /> Suggested topics</label>
                <label className="flex min-h-8 items-center gap-2"><input type="checkbox" checked={showLinks} onChange={(event) => setShowLinks(event.target.checked)} /> Links between notes</label>
              </fieldset>
            </div>
          )}
        </div>
        <button type="button" className={secondarySmall} onClick={tidy} title="Put moved cards back in their week and topic position">Tidy layout</button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          ref={boardRef}
          role="application"
          aria-roledescription="study map"
          aria-label="Study map. Weeks run left to right and topics top to bottom. Tab moves between cards, Enter reads one, Space previews it."
          tabIndex={0}
          className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-background focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-500"
          style={{ backgroundImage: "radial-gradient(var(--color-border) 1px, transparent 1.2px)" }}
          onPointerDown={onPointerDown}
          onPointerOver={onPointerOver}
          onPointerLeave={() => {
            setHovered(null);
            setHoverTopic(null);
            window.clearTimeout(previewTimer.current);
            leaveTimer.current = window.setTimeout(() => setPreview((current) => (current?.pinned ? current : null)), 250);
          }}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onKeyDown={onKeyDown}
          onFocusCapture={onFocusCapture}
        >
          <div ref={worldRef} className="absolute left-0 top-0 origin-top-left will-change-transform">
            {model.modules.map((module) => (
              <section
                key={module.mapId}
                aria-label={`${module.name} ${module.year}`}
                className="absolute rounded-[28px] border border-border-subtle bg-surface/40"
                style={{ left: -24, top: module.originY, width: model.width + 48, height: module.layout.height }}
              >
                <header className="absolute left-10 flex items-baseline gap-4 whitespace-nowrap" style={{ top: far ? 4 : 32, fontSize: far ? 60 : compact ? 44 : 34 }}>
                  <h2 className="font-semibold tracking-tight text-text">{module.name}</h2>
                  <span className="text-[0.45em] text-text-tertiary">
                    {module.year} · {module.items.filter((item) => item.kind !== "assignment").length} materials
                    {module.items.some((item) => item.kind === "assignment") ? ` · ${module.items.filter((item) => item.kind === "assignment").length} assignments` : ""}
                    {module.paperCount ? ` · ${module.paperCount} past ${module.paperCount === 1 ? "paper" : "papers"} in Exam history` : ""}
                  </span>
                  {model.modules.length > 1 && (
                    <button type="button" data-open-module={module.mapId} className="self-center rounded-radius-md border border-border-subtle bg-surface px-2.5 py-1 text-[0.4em] font-medium text-text-secondary hover:text-text">
                      Open module
                    </button>
                  )}
                </header>
              </section>
            ))}
            <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1} aria-hidden="true">
              <defs>
                <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,1 L9,5 L0,9 z" fill="var(--color-text-tertiary)" />
                </marker>
              </defs>
              {svg.under}
            </svg>
            {model.modules.map((module) => (
              <div key={`labels-${module.mapId}`}>
                {module.layout.columns.map((column) => (
                  <div
                    key={`week-${column.week}`}
                    data-week-label={column.week ?? "none"}
                    className="absolute whitespace-nowrap font-semibold text-text-secondary"
                    style={{ left: column.x + 22, top: module.originY + MODULE_HEADER - (far ? 64 : 52), fontSize: far ? 44 : compact ? 26 : 15 }}
                  >
                    {column.week === null ? "No week" : `Week ${column.week}`}
                  </div>
                ))}
                {module.layout.rows.map((row) => {
                  const topic = row.topic ? model.topics.get(row.topic.id) : undefined;
                  const parent = row.topic?.parentId ? module.topics.find((entry) => entry.id === row.topic!.parentId) : undefined;
                  const on = focus?.topicId === row.key;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      data-legend={row.topic ? row.key : undefined}
                      disabled={!row.topic}
                      aria-pressed={row.topic ? on : undefined}
                      className={`absolute flex flex-col items-start whitespace-nowrap rounded-radius-lg border px-3 py-2 text-left transition-shadow ${on ? "border-primary-500 bg-surface shadow-md" : "border-border-subtle bg-surface/90 hover:border-primary-400"} ${lowerQuery && row.topic && !row.topic.name.toLocaleLowerCase().includes(lowerQuery) ? "opacity-40" : ""}`}
                      style={{ left: 16, top: module.originY + row.y - (far ? 60 : 32), width: far ? undefined : LEGEND_WIDTH - 56, paddingLeft: parent ? 24 : 12 }}
                    >
                      <span className="flex items-center gap-2 font-semibold text-text" style={{ fontSize: far ? 64 : compact ? 24 : 15 }}>
                        <span className="shrink-0 rounded-full" style={{ width: far ? 28 : 11, height: far ? 28 : 11, background: topic?.colour ?? "var(--color-text-tertiary)" }} aria-hidden="true" />
                        {row.topic ? row.topic.name : "Not classified yet"}
                      </span>
                      {!far && (
                        <span className="text-xs text-text-tertiary" style={{ fontSize: compact ? 18 : undefined }}>
                          {row.topic
                            ? `${parent ? `${parent.name} · ` : ""}${legendCount(module, row.key)} core${topic?.exam ? ` · ${topic.exam.replace(/^In /, "in ").replace(/ reviewed.*/, " papers")}` : ""}`
                            : "Classify these to place them"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
            <CardLayer
              placed={culled}
              topics={model.topics}
              linkCount={model.linkCount}
              usedBy={model.usedBy}
              compact={compact}
              far={far}
              state={cardState}
              stops={stops}
              focusColour={focusTopic?.colour ?? null}
            />
            <svg className="pointer-events-none absolute left-0 top-0 z-10 overflow-visible" width={1} height={1} aria-hidden="true">
              {svg.over}
            </svg>
            {!far && svg.labels.map((label) => (
              <div
                key={label.key}
                className={`absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full border bg-surface px-2 py-0.5 text-xs text-text-secondary ${label.tone === "cross" ? "border-dashed border-border" : label.tone === "strong" ? "border-text-tertiary text-text shadow" : "border-border-subtle"}`}
                style={{ left: label.x, top: label.y }}
              >
                {label.text}
                {label.link?.origin === "yours" && label.tone === "strong" && (
                  <button type="button" data-flow-overlay className="pointer-events-auto rounded-full p-0.5 text-text-tertiary hover:text-error-600" aria-label={`Remove link ${label.text}`} onClick={() => removeLink(label.link!)}>
                    <XMarkIcon className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {focusTopic && focusModule && (
            <div data-flow-overlay>
              <TrailPanel
                topic={focusTopic}
                moduleName={focusModule.name}
                parentName={focusTopic.parentId ? model.topics.get(focusTopic.parentId)?.name ?? null : null}
                trail={trail}
                stop={focus?.stop ?? 0}
                supporting={focusModule.items.filter((item) => !stops.has(item.ref) && tagsShown(item).some((tag) => tag.topicId === focusTopic.id))}
                goesWith={focusModule.topics
                  .filter((topic) => topic.id !== focusTopic.id)
                  .map((topic) => ({ topic, count: focusModule.items.filter((item) => item.tags.some((tag) => tag.topicId === topic.id) && item.tags.some((tag) => tag.topicId === focusTopic.id)).length }))
                  .filter((entry) => entry.count > 0)
                  .sort((a, b) => b.count - a.count)}
                bridges={model.bridges
                  .filter((bridge) => bridge.a === focusTopic.id || bridge.b === focusTopic.id)
                  .flatMap((bridge) => {
                    const other = model.topics.get(bridge.a === focusTopic.id ? bridge.b : bridge.a);
                    const module = model.modules.find((entry) => entry.mapId === other?.mapId);
                    return other && module ? [{ topic: other, bridge, moduleName: module.name, loaded: true }] : [];
                  })}
                topics={model.topics}
                onStep={step}
                onGo={(ref) => goTo(ref, true)}
                onFollow={follow}
                onClose={() => setFocus(null)}
              />
            </div>
          )}

          {selectedPlaced && !compact && !connect && !(preview?.pinned && view.w < 640) && (() => {
            const position = toScreen(selectedPlaced.x + CARD_WIDTH / 2, selectedPlaced.y);
            if (position.y < 48 || position.x < 0 || position.x > view.w) return null;
            const pinned = selectedPlaced.module.board.placements.find((entry) => entry.id === selectedPlaced.item.ref);
            return (
              <div
                data-flow-overlay
                role="toolbar"
                aria-label={`Actions for ${selectedPlaced.item.title}`}
                className="absolute z-30 flex -translate-x-1/2 -translate-y-[calc(100%+10px)] items-center gap-1 rounded-radius-lg border border-border-subtle bg-surface p-1 text-xs shadow-lg"
                style={{ left: position.x, top: position.y }}
              >
                <button type="button" className={toolbarButton} onClick={() => openReader(selectedPlaced.item.ref)}>{selectedPlaced.item.assignment ? "Open" : "Read"}</button>
                <button type="button" className={toolbarButton} aria-pressed={Boolean(pinned?.pinned)} onClick={() => togglePin(selectedPlaced.item.ref)}>{pinned?.pinned ? "Unpin" : "Pin"}</button>
                <label className="flex items-center gap-1 px-1 text-text-secondary">
                  <span className="sr-only">Week</span>
                  <select
                    className="min-h-7 rounded-radius-md border border-border-subtle bg-surface px-1 text-xs text-text"
                    value={selectedPlaced.item.weekSource === "set" ? String(selectedPlaced.item.week ?? 0) : "detected"}
                    onChange={(event) => setWeek(selectedPlaced.item.ref, event.target.value)}
                    title="Teaching week"
                  >
                    <option value="detected">{selectedPlaced.item.weekSource === "set" ? "Use detected week" : `Detected: ${selectedPlaced.item.week === null ? "no week" : `week ${selectedPlaced.item.week}`}`}</option>
                    <option value="0">No week</option>
                    {weekOptions(selectedPlaced).map((week) => <option key={week} value={String(week)}>Week {week}</option>)}
                  </select>
                </label>
                <button type="button" className={toolbarButton} onClick={() => { setConnect({ from: selectedPlaced.item.ref, to: null, label: "" }); setPreview(null); }}>Link to…</button>
                {pinned && !pinned.pinned && <button type="button" className={toolbarButton} onClick={() => resetPosition(selectedPlaced.item.ref)}>Reset</button>}
              </div>
            );
          })()}

          {connect && (
            <div data-flow-overlay className="absolute left-1/2 top-3 z-40 w-[min(440px,calc(100%-1.5rem))] -translate-x-1/2 rounded-radius-xl border border-border-subtle bg-surface p-3 text-sm shadow-lg">
              {!connect.to ? (
                <div className="flex items-center gap-2">
                  <p className="text-text-secondary">Choose the card to link <b className="text-text">{model.byRef.get(connect.from)?.item.title}</b> to.</p>
                  <button type="button" className={`${secondarySmall} ml-auto`} onClick={() => setConnect(null)}>Cancel</button>
                </div>
              ) : (
                <form onSubmit={(event) => { event.preventDefault(); saveLink(); }}>
                  <p className="text-text-secondary">
                    <b className="text-text">{model.byRef.get(connect.from)?.item.title}</b> → <b className="text-text">{model.byRef.get(connect.to)?.item.title}</b>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {LINK_LABELS.map((label) => (
                      <button key={label} type="button" className={`rounded-full border px-2 py-0.5 text-xs ${connect.label === label ? "border-primary-500 bg-primary-500/10 text-text" : "border-border-subtle text-text-secondary"}`} onClick={() => setConnect({ ...connect, label })}>{label}</button>
                    ))}
                  </div>
                  <label className="mt-2 block text-xs text-text-tertiary">
                    Relationship
                    <input autoFocus maxLength={80} value={connect.label} onChange={(event) => setConnect({ ...connect, label: event.target.value })} className="mt-1 min-h-9 w-full rounded-radius-md border border-border-subtle bg-background px-2 text-base text-text md:text-sm" />
                  </label>
                  <div className="mt-2 flex justify-end gap-1.5">
                    <button type="button" className={secondarySmall} onClick={() => setConnect(null)}>Cancel</button>
                    <button type="submit" className={primarySmall} disabled={!connect.label.trim()}>Save link</button>
                  </div>
                </form>
              )}
            </div>
          )}

          {previewPlaced && previewStyle && !reader && (
            <div
              data-flow-overlay
              role="dialog"
              aria-label={`Preview of ${previewPlaced.item.title}`}
              className="absolute z-40 overflow-y-auto rounded-radius-xl border border-border-subtle bg-surface p-4 shadow-xl"
              style={previewStyle}
              onPointerEnter={() => window.clearTimeout(leaveTimer.current)}
              onPointerLeave={() => { leaveTimer.current = window.setTimeout(() => setPreview((current) => (current?.pinned ? current : null)), 250); }}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1"><ItemHeader placed={previewPlaced} /></div>
                {preview?.pinned && (
                  <button type="button" className="rounded-radius-md p-1 text-text-tertiary hover:text-text" onClick={() => setPreview(null)} aria-label="Close preview">
                    <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="mt-2"><ItemBody item={previewPlaced.item} full={false} /></div>
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
                onReview={() => onReview(previewPlaced.item.mapId, previewPlaced.item.id)}
                onAssignment={() => previewPlaced.item.assignment && setAssignmentOpen(previewPlaced.item.assignment)}
              />
            </div>
          )}

          <div data-flow-overlay className="absolute bottom-3 right-3 z-30 flex items-center gap-0.5 rounded-radius-lg border border-border-subtle bg-surface p-1 shadow-md">
            <button type="button" className={iconButton} onClick={() => zoomBy(0.8)} aria-label="Zoom out"><MinusIcon className="h-4 w-4" aria-hidden="true" /></button>
            <span className="min-w-12 text-center text-xs tabular-nums text-text-tertiary" aria-live="off">{Math.round(view.z * 100)}%</span>
            <button type="button" className={iconButton} onClick={() => zoomBy(1.25)} aria-label="Zoom in"><PlusIcon className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" className={iconButton} onClick={fit} aria-label="Fit everything"><ArrowsPointingOutIcon className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          {model.ordered.length === 0 && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <p className="max-w-sm text-sm text-text-secondary">Add notes, slides or files to this module and they will appear here by week and topic.</p>
            </div>
          )}
          <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
        </div>

        {readerPlaced && (
          <aside aria-label={`Reading ${readerPlaced.item.title}`} className="flex w-full max-w-[460px] shrink-0 flex-col border-l border-border-subtle bg-surface max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-50 max-lg:shadow-2xl">
            <div className="flex items-start gap-2 border-b border-border-subtle px-4 py-3">
              <div className="min-w-0 flex-1"><ItemHeader placed={readerPlaced} /></div>
              <button type="button" className="rounded-radius-md p-1.5 text-text-tertiary hover:bg-primary-500/5 hover:text-text" onClick={() => setReader(null)} aria-label="Close reader">
                <XMarkIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <ItemActions
                item={readerPlaced.item}
                onReview={() => onReview(readerPlaced.item.mapId, readerPlaced.item.id)}
                onAssignment={() => readerPlaced.item.assignment && setAssignmentOpen(readerPlaced.item.assignment)}
              >
                <button type="button" className={secondarySmall} onClick={() => goTo(readerPlaced.item.ref)}>Show on map</button>
              </ItemActions>
              <div className="mt-3"><ItemBody item={readerPlaced.item} full /></div>
              <div className="mt-3 border-t border-border-subtle pt-1">
                <ItemRelations
                  placed={readerPlaced}
                  topics={model.topics}
                  links={model.links}
                  lookup={lookup}
                  sources={model.sources.get(readerPlaced.item.ref) ?? []}
                  usedBy={model.usedBy.get(readerPlaced.item.ref) ?? []}
                  onGo={(ref) => { setReader(ref.startsWith("note:") ? ref : null); goTo(ref, !ref.startsWith("note:")); }}
                  onFollow={follow}
                />
              </div>
            </div>
          </aside>
        )}
      </div>
      {assignmentOpen && <AssignmentDetails assignment={assignmentOpen} onClose={() => setAssignmentOpen(null)} />}
    </div>
  );
}

