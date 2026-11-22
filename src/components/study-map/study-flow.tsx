"use client";

import {
  useEffect,
  useEffectEvent,
  useCallback,
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
  ArrowsPointingOutIcon,
  MinusIcon,
  PlusIcon,
  Squares2X2Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import AssignmentDetails from "@/components/assignments/assignment-details";
import {
  FAN_CARD_HEIGHT,
  FAN_CARD_WIDTH,
  FAN_MAX_CARDS,
  fanPositions,
  type Deck,
} from "@/lib/study-map/decks";

import { CARD_WIDTH, topicTrail, type FlowItem } from "@/lib/study-map/flow";

import type { StudyAssignment, StudyBoard } from "@/lib/study-map/types";

import { NoticeStack, islandButton, islandClass } from "./study-chrome";
import { TrailPanel } from "./study-flow-panels";

import {
  type FlowModule,
  DECK_ZOOM,
  COMPACT_ZOOM,
  CULL_THRESHOLD,
  TOP_INSET,
  iconButton,
  type Camera,
  type FilterKey,
  type Placed,
  filterKey,
  buildModel,
  connector,
  rectOf,
  headerRect,
  clamp,
  matchesQuery,
  cullToView,
} from "./study-flow-model";
import { CardLayer, DeckLayer, type DeckLayerProps } from "./study-flow-layers";
import { buildFlowSvg } from "./study-flow-svg";
import { useFlowCamera } from "./use-flow-camera";
import { useBoardEdits } from "./use-board-edits";
import { ClusterFrames, ModulePanels } from "./study-flow-frames";
import { FlowFilterMenu, FlowSearch } from "./study-flow-toolbar";
import { FlowReader } from "./study-flow-reader";
import { FlowConnectDialog, FlowPreview, type PendingLink } from "./study-flow-overlays";

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
  const {
    boardRef,
    worldRef,
    cameraRef,
    view,
    deckTable,
    animationRef,
    apply,
    zoomInput,
    flyTo,
    frameRect,
    fit,
    zoomBy,
  } = useFlowCamera(model, viewKey, () => setOpenDeck(null));
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoverTopic, setHoverTopic] = useState<string | null>(null);
  const [fanHot, setFanHot] = useState<string | null>(null);
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
  const [connect, setConnect] = useState<PendingLink | null>(null);
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

  useEffect(
    () => () => {
      window.clearTimeout(previewTimer.current);
      window.clearTimeout(leaveTimer.current);
    },
    [],
  );


  const deckMode = view.z < DECK_ZOOM || view.unfold !== null;
  const unfolded = view.unfold?.u ?? 0;
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
    const z = Math.max(cameraRef.current.z, 0.75);
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

  const {
    place,
    togglePin,
    resetPosition,
    setWeek,
    splitOut,
    tidy,
    addLink,
    removeLink,
  } = useBoardEdits(model, onBoardChange, setAnnouncement);
  const saveLink = () => {
    if (!connect?.to || !connect.label.trim()) return;
    addLink(connect.from, connect.to, connect.label);
    setConnect(null);
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
    cancelAnimationFrame(animationRef.current);
    pointers.current.set(event.pointerId, boardPoint(event));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        kind: "pinch",
        startX: (a.x + b.x) / 2,
        startY: (a.y + b.y) / 2,
        camera: { ...cameraRef.current },
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
      camera: { ...cameraRef.current },
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
      // step by step, so the pinch can park and unfold like the wheel does
      cameraRef.current = {
        ...cameraRef.current,
        x: cameraRef.current.x + centre.x - current.startX,
        y: cameraRef.current.y + centre.y - current.startY,
      };
      zoomInput(
        Math.log(distance / (current.distance || distance)),
        centre.x,
        centre.y,
      );
      current.startX = centre.x;
      current.startY = centre.y;
      current.distance = distance;
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
      cameraRef.current = {
        ...cameraRef.current,
        x: current.camera.x + dx,
        y: current.camera.y + dy,
      };
      apply();
    } else if (current.kind === "card" && current.ref && current.origin) {
      const next = {
        ref: current.ref,
        x: current.origin.x + dx / cameraRef.current.z,
        y: current.origin.y + dy / cameraRef.current.z,
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
    const fan = target?.closest<HTMLElement>("[data-fan]")?.dataset.fan ?? null;
    if (fan !== fanHot) setFanHot(fan);
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
        cameraRef.current = {
          ...cameraRef.current,
          x: cameraRef.current.x + delta[0],
          y: cameraRef.current.y + delta[1],
        };
        apply();
      }
    }
  }

  function onFocusCapture(event: ReactFocusEvent<HTMLDivElement>) {
    // tabbing through a fan lifts each card like hovering does
    if (
      event.target instanceof HTMLElement &&
      event.target.matches(":focus-visible")
    )
      setFanHot(event.target.dataset.fan ?? null);
    // keep keyboard focus visible by bringing an offscreen card into view
    const card =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-card]")
        : null;
    const ref = card?.dataset.card;
    const placed = ref ? model.byRef.get(ref) : undefined;
    const board = boardRef.current;
    if (!placed || !board || gesture.current) return;
    const { x, y, z } = cameraRef.current;
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
  const svg = useMemo(
    () =>
      buildFlowSvg({
        activeRef,
        connecting: connect !== null,
        focus,
        hoverTopic,
        model,
        positionOf,
        showLinks,
        stops,
        tagsShown,
        trail,
      }),
    [activeRef, connect, focus, hoverTopic, model, positionOf, showLinks, stops, tagsShown, trail],
  );

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

  const onSearch = () => {
    if (!lowerQuery) return;
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
  };

  const scheduleLeave = () => {
    leaveTimer.current = window.setTimeout(
      () => setPreview((current) => (current?.pinned ? current : null)),
      250,
    );
  };
  const startLink = (ref: string) => {
    // linking picks a target card, and cards only exist zoomed in
    if (deckMode) goTo(ref);
    setConnect({ from: ref, to: null, label: "" });
    setPreview(null);
  };

  return (
    <div className="relative flex h-full min-h-0 w-full">
      <div className="relative min-h-0 min-w-0 flex-1">
        <div
          ref={boardRef}
          role="application"
          aria-roledescription="study map"
          aria-label="Study map. Zoomed out, each topic is a deck: Enter fans it out. Zoomed in, cards are grouped by topic. Tab moves between them, Enter reads a card, Space previews it."
          tabIndex={0}
          className="absolute inset-0 touch-none select-none overflow-hidden bg-background focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
          style={{
            backgroundImage:
              "radial-gradient(var(--color-border-subtle) 1px, transparent 1.2px)",
          }}
          onPointerDown={onPointerDown}
          onPointerOver={onPointerOver}
          onPointerLeave={() => {
            setHovered(null);
            setHoverTopic(null);
            setFanHot(null);
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
            <ModulePanels
              model={model}
              deckTable={deckTable}
              deckMode={deckMode}
              view={view}
              unfolded={unfolded}
              compact={compact}
            />
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
                unfold={view.unfold}
                hot={fanHot}
                seam={view.seam}
              />
            ) : (
            <div className={view.seam ? undefined : "study-layer-in"}>
            <svg
              className="pointer-events-none absolute left-0 top-0 overflow-visible"
              width={1}
              height={1}
              aria-hidden="true"
            >
              {svg.edges}
            </svg>
            <ClusterFrames
              model={model}
              focus={focus}
              lowerQuery={lowerQuery}
              compact={compact}
            />
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
            {/* after an unfold the frames are already there, so only the cards fade in */}
            <div className={view.seam ? "study-layer-in" : undefined}>
              <CardLayer
                placed={culled}
                compact={compact}
                state={cardState}
                stops={stops}
                focusColour={focusTopic?.colour ?? null}
              />
            </div>
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
                  className={`absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full border bg-surface px-2 py-0.5 text-xs text-text-secondary ${label.tone === "cross" ? "border-dashed border-border" : label.tone === "strong" ? "border-text-tertiary text-text shadow-raised" : "border-border-subtle"}`}
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
            <FlowConnectDialog
              connect={connect}
              setConnect={setConnect}
              model={model}
              saveLink={saveLink}
            />
          )}

          {previewPlaced && previewStyle && !reader && !connect && (
            <FlowPreview
              previewPlaced={previewPlaced}
              previewStyle={previewStyle}
              pinned={Boolean(preview?.pinned)}
              previewPin={previewPin}
              deckMode={deckMode}
              showLinks={showLinks}
              model={model}
              lookup={lookup}
              onPointerEnter={() => window.clearTimeout(leaveTimer.current)}
              onPointerLeave={scheduleLeave}
              closePreview={() => setPreview(null)}
              goTo={goTo}
              follow={follow}
              openReader={openReader}
              onReview={onReview}
              setAssignmentOpen={setAssignmentOpen}
              startLink={startLink}
              togglePin={togglePin}
              resetPosition={resetPosition}
              setWeek={setWeek}
              weekOptions={weekOptions}
              splitOut={splitOut}
            />
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
            <FlowSearch
              query={query}
              setQuery={setQuery}
              searchOpen={searchOpen}
              setSearchOpen={setSearchOpen}
              onSearch={onSearch}
            />
            <FlowFilterMenu
              hidden={hidden}
              setHidden={setHidden}
              showSuggested={showSuggested}
              setShowSuggested={setShowSuggested}
              showLinks={showLinks}
              setShowLinks={setShowLinks}
              filtered={filtered}
            />
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
        <FlowReader
          readerPlaced={readerPlaced}
          model={model}
          lookup={lookup}
          setReader={setReader}
          setAssignmentOpen={setAssignmentOpen}
          onReview={onReview}
          goTo={goTo}
          follow={follow}
        />
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
