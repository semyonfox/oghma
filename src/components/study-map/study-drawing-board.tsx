"use client";

import "@excalidraw/excalidraw/index.css";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  convertToExcalidrawElements,
  loadFromBlob,
  newElementWith,
} from "@excalidraw/excalidraw";
import type {
  ExcalidrawElement,
  ExcalidrawEmbeddableElement,
} from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import {
  boardSceneSchema,
  getSceneReference,
  pruneAvailableRefs,
  type SceneReference,
  type BoardScene,
} from "@/lib/study-map/board-scene";
import {
  effectiveAssociations,
  type StudyBoard,
  type StudyMapSnapshot,
} from "@/lib/study-map/types";
import { StudyBoardCard } from "./study-board-card";

type Selection = { kind: "note" | "topic"; id: string };
interface StudyDrawingBoardProps {
  snapshot: StudyMapSnapshot;
  selected: Selection | null;
  onSelect: (selection: Selection | null) => void;
  onBoardChange: (board: StudyBoard) => void;
  onBoardError: (message: string | null) => void;
}
type ReferenceOption = { reference: SceneReference; title: string };
const CARD_WIDTH = 320;
const CARD_HEIGHT = 300;
const buttonClass =
  "inline-flex min-h-9 items-center justify-center rounded-radius-md px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-primary-500/10 hover:text-primary-500 focus-visible:outline-2 focus-visible:outline-primary-500 disabled:opacity-40";
const fieldClass =
  "min-w-0 rounded-radius-md border border-border-subtle bg-surface px-3 py-2 text-base text-text focus-visible:outline-2 focus-visible:outline-primary-500 md:text-sm";

function referenceKey(reference: SceneReference) {
  return `${reference.kind}:${reference.id}`;
}
function referenceLink(reference: SceneReference, mapId: string) {
  return reference.kind === "note"
    ? `/notes/${reference.id}`
    : `/study-map?topic=${reference.id}&map=${mapId}`;
}
function safeEmbedLink(link: string, mapId: string) {
  if (/^\/notes\/[a-f\d-]{36}$/i.test(link)) return true;
  if (!link.startsWith("/study-map?")) return false;
  const url = new URL(link, "https://local.invalid");
  return (
    url.searchParams.get("map") === mapId &&
    /^[a-f\d-]{36}$/i.test(url.searchParams.get("topic") ?? "")
  );
}
function referenceElement(
  reference: SceneReference,
  mapId: string,
  x: number,
  y: number,
  pinned = false,
): ExcalidrawEmbeddableElement {
  const rectangle = convertToExcalidrawElements(
    [
      {
        id: referenceKey(reference),
        type: "rectangle",
        x,
        y,
        width: CARD_WIDTH,
        height: reference.kind === "topic" ? 190 : CARD_HEIGHT,
        roughness: 0,
        backgroundColor: "#ffffff",
        strokeColor: "#b8b1cd",
        fillStyle: "solid",
      },
    ],
    { regenerateIds: false },
  )[0];
  return {
    ...rectangle,
    type: "embeddable",
    locked: pinned,
    customData: { studyRef: reference },
    link: referenceLink(reference, mapId),
  };
}
async function restoreDrawing(
  elements: unknown,
  appState: unknown,
): Promise<ExcalidrawInitialDataState> {
  // the official importer restores branded coordinates and fractional indices
  return loadFromBlob(
    new Blob(
      [
        JSON.stringify({
          type: "excalidraw",
          version: 2,
          source: "OghmaNotes",
          elements,
          appState,
        }),
      ],
      { type: "application/json" },
    ),
    null,
    null,
  );
}
function safeState(state: AppState) {
  return {
    scrollX: state.scrollX,
    scrollY: state.scrollY,
    zoom: { value: state.zoom.value },
    viewBackgroundColor: state.viewBackgroundColor,
    gridSize: state.gridSize,
  };
}
function revisionKey(elements: readonly ExcalidrawElement[], state: AppState) {
  return JSON.stringify([
    elements.map(({ id, version, versionNonce, isDeleted, index }) => [
      id,
      version,
      versionNonce,
      isDeleted,
      index,
    ]),
    safeState(state),
  ]);
}
function serializableScene(
  elements: readonly ExcalidrawElement[],
  state: AppState,
  mapId: string,
  availableReferences: ReadonlySet<string>,
): unknown {
  const liveReferences = new Set(
    elements.flatMap((element) => {
      const reference = !element.isDeleted ? getSceneReference(element) : null;
      return reference ? [referenceKey(reference)] : [];
    }),
  );
  const deletedReferences = new Set<string>();
  const persisted = elements.flatMap((element): ExcalidrawElement[] => {
    if (!element.isDeleted) return [element];
    const reference = getSceneReference(element);
    if (!reference) return [];
    const key = referenceKey(reference);
    if (
      !availableReferences.has(key) ||
      liveReferences.has(key) ||
      deletedReferences.has(key)
    )
      return [];
    deletedReferences.add(key);
    // deletion markers prevent re-adding references without retaining rejected content
    return [
      {
        ...referenceElement(reference, mapId, 0, 0),
        id: element.id,
        isDeleted: true,
        seed: 0,
        version: 1,
        versionNonce: 0,
        updated: 0,
        index: null,
      },
    ];
  });
  const serialized: unknown = JSON.parse(
    JSON.stringify({
      version: 1,
      elements: persisted,
      appState: safeState(state),
    }),
  );
  return serialized;
}
function bounds(elements: readonly ExcalidrawElement[]) {
  const live = elements.filter((element) => !element.isDeleted);
  return {
    right: Math.max(0, ...live.map((element) => element.x + element.width)),
    bottom: Math.max(0, ...live.map((element) => element.y + element.height)),
  };
}

async function arrowElements(
  source: ExcalidrawElement,
  target: ExcalidrawElement,
  label: string,
  id = crypto.randomUUID(),
): Promise<readonly ExcalidrawElement[]> {
  const from = {
    x: source.x + source.width + 12,
    y: source.y + source.height / 2,
  };
  const to = { x: target.x - 12, y: target.y + target.height / 2 };
  const base = convertToExcalidrawElements(
    [
      {
        id,
        type: "arrow",
        x: from.x,
        y: from.y,
        width: Math.abs(to.x - from.x),
        height: Math.abs(to.y - from.y),
        roughness: 0,
        label: { text: label, fontSize: 16, fontFamily: 2 },
        startBinding: { elementId: source.id, focus: 0, gap: 12 },
        endBinding: { elementId: target.id, focus: 0, gap: 12 },
      },
    ],
    { regenerateIds: false },
  );
  const imported = await restoreDrawing(
    [
      source,
      target,
      ...base.map((element) =>
        element.type === "arrow"
          ? {
              ...element,
              startBinding: { elementId: source.id, focus: 0, gap: 12 },
              endBinding: { elementId: target.id, focus: 0, gap: 12 },
              points: [
                [0, 0],
                [to.x - from.x, to.y - from.y],
              ],
            }
          : element,
      ),
    ],
    {},
  );
  const addedIds = new Set(base.map((element) => element.id));
  return (imported.elements ?? []).filter((element) =>
    addedIds.has(element.id),
  );
}
function attachArrow(
  elements: readonly ExcalidrawElement[],
  additions: readonly ExcalidrawElement[],
  sourceId: string,
  targetId: string,
) {
  const arrow = additions.find((element) => element.type === "arrow");
  if (!arrow) return elements;
  return [
    ...elements.map((element) =>
      element.id === sourceId || element.id === targetId
        ? newElementWith(element, {
            boundElements: [
              ...(element.boundElements ?? []),
              { id: arrow.id, type: "arrow" },
            ],
          })
        : element,
    ),
    ...additions,
  ];
}

async function initialDrawing(
  snapshot: StudyMapSnapshot,
): Promise<ExcalidrawInitialDataState> {
  if (snapshot.map.board.scene)
    return restoreDrawing(
      snapshot.map.board.scene.elements,
      snapshot.map.board.scene.appState,
    );
  const placements = new Map(
    snapshot.map.board.placements.map((entry) => [entry.id, entry]),
  );
  const elements: ExcalidrawElement[] = [];
  const frameIds = new Map<string, string>();
  const noteElements = snapshot.materials.map((material, index) => {
    const reference: SceneReference = { kind: "note", id: material.noteId };
    const placement = placements.get(referenceKey(reference));
    return referenceElement(
      reference,
      snapshot.map.id,
      placement?.x ?? (index % 3) * 360,
      placement?.y ?? Math.floor(index / 3) * 340 + 80,
      placement?.pinned,
    );
  });
  for (const [index, topic] of snapshot.map.topics.entries()) {
    const placement = placements.get(`topic:${topic.id}`);
    const x = placement?.x ?? index * 900;
    const y = placement?.y ?? 0;
    const contained = noteElements.filter((element) => {
      const reference = getSceneReference(element);
      return (
        reference &&
        placements.get(referenceKey(reference))?.topicId === topic.id
      );
    });
    const definitionY = Math.max(
      y + 60,
      ...contained.map((element) => element.y + element.height + 28),
    );
    const definition = referenceElement(
      { kind: "topic", id: topic.id },
      snapshot.map.id,
      x + 24,
      definitionY,
      placement?.pinned,
    );
    const frameId = `frame:${topic.id}`;
    frameIds.set(topic.id, frameId);
    const width = Math.max(
      724,
      ...contained.map((element) => element.x + element.width + 24 - x),
    );
    const height = Math.max(420, definitionY + definition.height + 24 - y);
    const frame = convertToExcalidrawElements(
      [
        {
          id: frameId,
          type: "frame",
          name: topic.name,
          x,
          y,
          width,
          height,
          children: [],
          locked: placement?.pinned ?? false,
        },
      ],
      { regenerateIds: false },
    )[0];
    elements.push(
      { ...frame, x, y, width, height, locked: placement?.pinned ?? false },
      { ...definition, frameId },
    );
  }
  for (const element of noteElements) {
    const reference = getSceneReference(element);
    const topicId = reference
      ? placements.get(referenceKey(reference))?.topicId
      : null;
    elements.push({
      ...element,
      frameId: topicId ? (frameIds.get(topicId) ?? null) : null,
    });
  }
  let linked: readonly ExcalidrawElement[] = elements;
  for (const link of snapshot.map.board.links) {
    const source = linked.find((element) => element.id === link.source);
    const target = linked.find((element) => element.id === link.target);
    if (source && target)
      linked = attachArrow(
        linked,
        await arrowElements(source, target, link.label, link.id),
        source.id,
        target.id,
      );
  }
  const camera = snapshot.map.board.viewport;
  return restoreDrawing(linked, {
    scrollX: camera ? camera.x / camera.zoom : 40,
    scrollY: camera ? camera.y / camera.zoom : 40,
    zoom: { value: camera?.zoom ?? 0.8 },
    viewBackgroundColor: "#faf9fd",
  });
}

function ReferenceContent({
  element,
  state,
  snapshot,
  selected,
  onSelect,
}: {
  element: ExcalidrawEmbeddableElement;
  state: AppState;
  snapshot: StudyMapSnapshot;
  selected: Selection | null;
  onSelect: StudyDrawingBoardProps["onSelect"];
}) {
  const reference = getSceneReference(element);
  const container = useRef<HTMLDivElement>(null);
  const active =
    state.activeEmbeddable?.state === "active" &&
    state.activeEmbeddable.element.id === element.id;
  const controlsEnabled = active || state.activeTool.type === "selection";
  useEffect(() => {
    if (active)
      container.current
        ?.querySelector<HTMLElement>("a,button")
        ?.focus({ preventScroll: true });
  }, [active]);
  const material =
    reference?.kind === "note"
      ? snapshot.materials.find((entry) => entry.noteId === reference.id)
      : undefined;
  const topic =
    reference?.kind === "topic"
      ? snapshot.map.topics.find((entry) => entry.id === reference.id)
      : undefined;
  const highlighted =
    material &&
    selected?.kind === "topic" &&
    effectiveAssociations(material, snapshot.map.taxonomyVersion).some(
      (entry) => entry.topicId === selected.id,
    );
  return (
    <div
      ref={container}
      data-study-reference={reference ? referenceKey(reference) : "unavailable"}
      className={`h-full w-full ${controlsEnabled ? "[&_a]:pointer-events-auto [&_button]:pointer-events-auto" : ""} ${highlighted ? "rounded-radius-lg ring-4 ring-primary-500/60" : ""}`}
      onPointerDown={(event) => {
        // card actions should not start a selection or drag in the drawing editor
        if (
          controlsEnabled &&
          event.target instanceof Element &&
          event.target.closest("a,button")
        ) event.stopPropagation();
      }}
    >
      {material ? (
        <StudyBoardCard
          material={material}
          topics={snapshot.map.topics}
          taxonomyVersion={snapshot.map.taxonomyVersion}
          onInspect={() => onSelect({ kind: "note", id: material.noteId })}
          onTopic={(id) => onSelect({ kind: "topic", id })}
        />
      ) : topic ? (
        <article className="flex h-full w-full flex-col overflow-auto rounded-radius-lg border border-border-subtle bg-surface p-4 font-sans text-text shadow-sm">
          <span className="text-xs text-text-tertiary">
            Live topic definition
          </span>
          <h3 className="mt-2 text-base font-semibold">{topic.name}</h3>
          <p className="mt-2 flex-1 overflow-auto text-sm text-text-secondary">
            {topic.definition}
          </p>
          <button
            type="button"
            className={`${buttonClass} mt-3 border border-border-subtle`}
            onClick={() => onSelect({ kind: "topic", id: topic.id })}
          >
            Review definition
          </button>
        </article>
      ) : (
        <div className="flex h-full items-center justify-center rounded-radius-lg border border-border-subtle bg-surface p-4 font-sans text-sm text-text-secondary">
          This reference is unavailable. Remove this card or add an available
          material.
        </div>
      )}
    </div>
  );
}

export default function StudyDrawingBoard(props: StudyDrawingBoardProps) {
  const initialResolved = useRef(false);
  const [initialData] = useState(() =>
    initialDrawing(props.snapshot).then((drawing) => {
      initialResolved.current = true;
      return {
        ...drawing,
        appState: {
          ...drawing.appState,
          currentItemRoughness: 0,
          currentItemFontFamily: 2,
          currentItemFillStyle: "solid" as const,
        },
      };
    }),
  );
  const latest = useRef(props);
  latest.current = props;
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const [ready, setReady] = useState(false);
  const initialized = useRef(false);
  const previousRevision = useRef<string | null>(null);
  const known = useRef(
    new Set(
      props.snapshot.map.board.scene
        ? props.snapshot.map.board.scene.elements.flatMap((element) => {
            const reference = getSceneReference(element);
            return reference ? [referenceKey(reference)] : [];
          })
        : [
            ...props.snapshot.materials.map((entry) => `note:${entry.noteId}`),
            ...props.snapshot.map.topics.map((entry) => `topic:${entry.id}`),
          ],
    ),
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef<string[]>([]);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const reportError = useCallback((message: string | null) => {
    setError(message);
    latest.current.onBoardError(message);
  }, []);
  const [announcement, setAnnouncement] = useState("");
  const [trayOpen, setTrayOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkSource, setLinkSource] = useState("");
  const [linkTarget, setLinkTarget] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const update = () =>
      setTheme(
        document.documentElement.classList.contains("dark") ? "dark" : "light",
      );
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const emitScene = useCallback((scene: BoardScene) => {
    const current = latest.current;
    const valid = new Set([
      ...current.snapshot.materials.map((entry) => `note:${entry.noteId}`),
      ...current.snapshot.map.topics.map((entry) => `topic:${entry.id}`),
    ]);
    const board = current.snapshot.map.board;
    current.onBoardChange({
      ...board,
      placements: board.placements
        .filter((entry) => valid.has(entry.id))
        .map((entry) =>
          entry.topicId && !valid.has(`topic:${entry.topicId}`)
            ? { ...entry, topicId: null }
            : entry,
        ),
      links: board.links.filter(
        (entry) => valid.has(entry.source) && valid.has(entry.target),
      ),
      scene,
    });
  }, []);

  const onChange = useCallback<NonNullable<ExcalidrawProps["onChange"]>>(
    (elements, state) => {
      if (state.isLoading || !initialResolved.current) return;
      const nextSelected = elements
        .filter(
          (element) =>
            !element.isDeleted && state.selectedElementIds[element.id],
        )
        .map((element) => element.id);
      if (nextSelected.join("|") !== selectedIdsRef.current.join("|")) {
        selectedIdsRef.current = nextSelected;
        setSelectedIds(nextSelected);
      }
      const revision = revisionKey(elements, state);
      if (
        state.cursorButton === "down" ||
        state.selectedElementsAreBeingDragged ||
        state.resizingElement
      )
        return;
      const first = !initialized.current;
      if (first) {
        initialized.current = true;
        setReady(true);
      }
      const current = latest.current.snapshot;
      const availableReferences = new Set([
        ...current.materials.map((material) => `note:${material.noteId}`),
        ...current.map.topics.map((topic) => `topic:${topic.id}`),
      ]);
      if (
        elements.some((element) => {
          const reference = !element.isDeleted
            ? getSceneReference(element)
            : null;
          return reference && !availableReferences.has(referenceKey(reference));
        })
      ) {
        reportError(
          "This card is not a material or topic in this module. Remove it from the board, then use Add materials to add its source before placing it again.",
        );
        return;
      }
      if (revision === previousRevision.current) {
        reportError(null);
        return;
      }
      const shouldPersist = !first || !latest.current.snapshot.map.board.scene;
      setSelectionVersion((version) => version + 1);
      if (!shouldPersist) {
        previousRevision.current = revision;
        reportError(null);
        return;
      }
      const parsed = boardSceneSchema.safeParse(
        serializableScene(elements, state, current.map.id, availableReferences),
      );
      if (!parsed.success) {
        if (state.editingTextElement) return;
        reportError(
          `This change cannot be saved: ${parsed.error.issues[0]?.message ?? "unsupported drawing content"}. Undo it or remove the item, then try again.`,
        );
        return;
      }
      previousRevision.current = revision;
      reportError(null);
      emitScene(pruneAvailableRefs(parsed.data, availableReferences));
    },
    [emitScene, reportError],
  );

  const options = useMemo<ReferenceOption[]>(
    () => [
      ...props.snapshot.materials.map((material) => ({
        reference: { kind: "note" as const, id: material.noteId },
        title: material.title || "Untitled note",
      })),
      ...props.snapshot.map.topics.map((topic) => ({
        reference: { kind: "topic" as const, id: topic.id },
        title: topic.name,
      })),
    ],
    [props.snapshot.materials, props.snapshot.map.topics],
  );

  useEffect(() => {
    const editor = api.current;
    if (!ready || !editor) return;
    const imported = options.filter(
      (option) => !known.current.has(referenceKey(option.reference)),
    );
    if (imported.length === 0) return;
    const current = editor.getSceneElementsIncludingDeleted();
    const extent = bounds(current);
    const additions = imported.map((option, index) =>
      referenceElement(
        option.reference,
        props.snapshot.map.id,
        extent.right + 100 + (index % 2) * 360,
        Math.floor(index / 2) * 340 + 60,
      ),
    );
    imported.forEach((option) =>
      known.current.add(referenceKey(option.reference)),
    );
    editor.updateScene({
      elements: [...current, ...additions],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setAnnouncement(
      `${imported.length} new ${imported.length === 1 ? "reference added" : "references added"} beside the existing board`,
    );
  }, [ready, options, props.snapshot.map.id]);

  const renderEmbeddable = useCallback<
    NonNullable<ExcalidrawProps["renderEmbeddable"]>
  >(
    (element, state) => (
      <ReferenceContent
        element={element}
        state={state}
        snapshot={props.snapshot}
        selected={props.selected}
        onSelect={props.onSelect}
      />
    ),
    [props.snapshot, props.selected, props.onSelect],
  );
  const nativeElements = api.current?.getSceneElements() ?? [];
  const selectedElements = nativeElements.filter((element) =>
    selectedIds.includes(element.id),
  );
  const sole = selectedElements.length === 1 ? selectedElements[0] : undefined;
  const selectedReference = sole ? getSceneReference(sole) : null;
  const allPinned =
    selectedElements.length > 0 &&
    selectedElements.every((element) => element.locked);
  const nativeOptions = nativeElements.flatMap((element) => {
    const reference = getSceneReference(element);
    const option = reference
      ? options.find(
          (entry) => referenceKey(entry.reference) === referenceKey(reference),
        )
      : undefined;
    return option ? [{ id: element.id, title: option.title }] : [];
  });
  const filteredOptions = options.filter((option) =>
    option.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  const locate = (reference: SceneReference) => {
    const editor = api.current;
    const element = editor?.getSceneElements().find((entry) => {
      const current = getSceneReference(entry);
      return current && referenceKey(current) === referenceKey(reference);
    });
    if (editor && element) {
      setTrayOpen(false);
      editor.scrollToContent(element, { animate: false });
      editor.updateScene({
        appState: { selectedElementIds: { [element.id]: true } },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      setAnnouncement(
        `Found ${options.find((option) => referenceKey(option.reference) === referenceKey(reference))?.title ?? "reference"}`,
      );
    } else
      setAnnouncement(
        "This material is not on the board. Add it from the material tray.",
      );
  };
  const addReference = (reference: SceneReference) => {
    const editor = api.current;
    if (!editor) return;
    const existing = editor.getSceneElements().find((element) => {
      const current = getSceneReference(element);
      return current && referenceKey(current) === referenceKey(reference);
    });
    if (existing) {
      locate(reference);
      return;
    }
    const state = editor.getAppState();
    const created = referenceElement(
      reference,
      props.snapshot.map.id,
      -state.scrollX + state.width / state.zoom.value / 2 - CARD_WIDTH / 2,
      -state.scrollY + state.height / state.zoom.value / 2 - CARD_HEIGHT / 2,
    );
    const element = { ...created, id: crypto.randomUUID() };
    editor.updateScene({
      elements: [...editor.getSceneElementsIncludingDeleted(), element],
      appState: { selectedElementIds: { [element.id]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setTrayOpen(false);
    setAnnouncement(
      "Reference added. Its original content stays in the library.",
    );
  };
  const addSticky = () => {
    const editor = api.current;
    if (!editor) return;
    const state = editor.getAppState();
    const elements = convertToExcalidrawElements([
      {
        type: "rectangle",
        x: -state.scrollX + state.width / state.zoom.value / 2 - 120,
        y: -state.scrollY + state.height / state.zoom.value / 2 - 80,
        width: 240,
        height: 160,
        backgroundColor: "#fff3b8",
        strokeColor: "#c5a955",
        fillStyle: "solid",
        roughness: 0,
        label: { text: "Your idea", fontSize: 22, fontFamily: 2 },
      },
    ]);
    editor.updateScene({
      elements: [...editor.getSceneElementsIncludingDeleted(), ...elements],
      appState: { selectedElementIds: { [elements[0].id]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setAnnouncement("Sticky note added. Double-click its text to edit.");
  };
  const removeSelection = () => {
    const editor = api.current;
    if (!editor) return;
    editor.updateScene({
      elements: editor
        .getSceneElementsIncludingDeleted()
        .map((element) =>
          selectedIds.includes(element.id) && !element.locked
            ? newElementWith(element, { isDeleted: true })
            : element,
        ),
      appState: { selectedElementIds: {} },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setAnnouncement(
      "Removed from the board. Original materials remain in your library.",
    );
  };
  const pinSelection = () => {
    const editor = api.current;
    if (!editor) return;
    editor.updateScene({
      elements: editor
        .getSceneElementsIncludingDeleted()
        .map((element) =>
          selectedIds.includes(element.id)
            ? newElementWith(element, { locked: !allPinned })
            : element,
        ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setAnnouncement(allPinned ? "Selection unpinned" : "Selection pinned");
  };
  const addLink = async () => {
    const editor = api.current;
    if (!editor || !linkLabel.trim() || linkSource === linkTarget) return;
    const source = editor
      .getSceneElements()
      .find((element) => element.id === linkSource);
    const target = editor
      .getSceneElements()
      .find((element) => element.id === linkTarget);
    if (!source || !target) return;
    setLinkBusy(true);
    try {
      const additions = await arrowElements(source, target, linkLabel.trim());
      if (
        !editor
          .getSceneElements()
          .some((element) => element.id === source.id) ||
        !editor.getSceneElements().some((element) => element.id === target.id)
      ) {
        setError("A link endpoint was removed. Choose two available cards.");
        return;
      }
      editor.updateScene({
        elements: attachArrow(
          editor.getSceneElementsIncludingDeleted(),
          additions,
          source.id,
          target.id,
        ),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      setLinkOpen(false);
      setAnnouncement("Labelled connector added");
    } catch {
      setError(
        "The connector could not be added. Your existing drawing is unchanged; try again.",
      );
    } finally {
      setLinkBusy(false);
    }
  };
  const blockFiles = () =>
    setAnnouncement(
      "Use Add materials to add sources to this module, then add their live cards to this board. Images and PDFs must remain owned attachments.",
    );

  return (
    <section
      role="region"
      aria-label="Study map canvas"
      className={`relative flex h-full min-h-0 flex-1 flex-col bg-surface text-text ${selectedReference ? "[&_.selected-shape-actions]:hidden" : ""}`}
      data-board-revision={selectionVersion}
      onDropCapture={(event) => {
        if (event.dataTransfer.files.length) {
          event.preventDefault();
          event.stopPropagation();
          blockFiles();
        }
      }}
      onPasteCapture={(event) => {
        if (event.clipboardData.files.length) {
          event.preventDefault();
          event.stopPropagation();
          blockFiles();
        }
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border-subtle bg-surface px-3 py-2">
        <button
          type="button"
          className={buttonClass}
          disabled={!ready}
          aria-expanded={trayOpen}
          onClick={() => setTrayOpen((open) => !open)}
        >
          Add to board
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!ready}
          onClick={() => api.current?.setActiveTool({ type: "frame" })}
        >
          Frame
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!ready}
          onClick={() => api.current?.setActiveTool({ type: "arrow" })}
        >
          Connect
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!ready}
          onClick={addSticky}
        >
          Sticky note
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!ready || nativeOptions.length < 2}
          onClick={() => {
            setLinkSource(sole?.id ?? "");
            setLinkTarget("");
            setLinkLabel("");
            setLinkOpen(true);
          }}
        >
          Add link
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!ready}
          onClick={() =>
            api.current?.scrollToContent(undefined, { animate: false })
          }
        >
          Fit board
        </button>
        {props.selected && (
          <button
            type="button"
            className={buttonClass}
            disabled={!ready}
            onClick={() => {
              if (props.selected) locate(props.selected);
            }}
          >
            Find selected
          </button>
        )}
        <span className="ml-auto hidden text-xs text-text-tertiary xl:block">
          Select and drag · space to pan · double-click text to edit
        </span>
      </div>
      {selectedElements.length > 0 && (
        <div
          className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border-subtle bg-surface px-3 py-2"
          role="group"
          aria-label="Board selection"
        >
          <span className="mr-2 text-xs text-text-tertiary">
            {selectedElements.length === 1
              ? (nativeOptions.find((option) => option.id === sole?.id)
                  ?.title ?? "Drawing selected")
              : `${selectedElements.length} items selected`}
          </span>
          <button
            type="button"
            className={buttonClass}
            aria-pressed={allPinned}
            onClick={pinSelection}
          >
            {allPinned ? "Unpin selection" : "Pin selection"}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={selectedElements.every((element) => element.locked)}
            onClick={removeSelection}
          >
            Remove from board
          </button>
          {selectedReference && (
            <button
              type="button"
              className={buttonClass}
              onClick={() => props.onSelect(selectedReference)}
            >
              Inspect reference
            </button>
          )}
          {selectedReference?.kind === "note" && (
            <Link
              className={`${buttonClass} text-primary-500 underline`}
              href={`/notes/${selectedReference.id}`}
            >
              Open original
            </Link>
          )}
          {sole?.type === "embeddable" && (
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                api.current?.updateScene({
                  appState: {
                    activeEmbeddable: { element: sole, state: "active" },
                  },
                  captureUpdate: CaptureUpdateAction.NEVER,
                })
              }
            >
              Use card controls
            </button>
          )}
        </div>
      )}
      {linkOpen && (
        <form
          className="flex shrink-0 flex-wrap items-end gap-2 border-b border-border-subtle bg-surface p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void addLink();
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
            From
            <select
              required
              className={fieldClass}
              value={linkSource}
              onChange={(event) => setLinkSource(event.target.value)}
            >
              <option value="">Choose a card</option>
              {nativeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
            To
            <select
              required
              className={fieldClass}
              value={linkTarget}
              onChange={(event) => setLinkTarget(event.target.value)}
            >
              <option value="">Choose a card</option>
              {nativeOptions
                .filter((option) => option.id !== linkSource)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
            Relationship
            <input
              required
              maxLength={80}
              className={fieldClass}
              value={linkLabel}
              onChange={(event) => setLinkLabel(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className={buttonClass}
            disabled={
              linkBusy ||
              !linkSource ||
              !linkTarget ||
              linkSource === linkTarget ||
              !linkLabel.trim()
            }
          >
            Save link
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={linkBusy}
            onClick={() => setLinkOpen(false)}
          >
            Cancel
          </button>
        </form>
      )}
      {error && (
        <p
          role="alert"
          className="shrink-0 border-b border-border-subtle bg-danger/5 px-3 py-2 text-sm text-text"
        >
          {error}
        </p>
      )}
      <div className="relative min-h-0 flex-1">
        <Excalidraw
          initialData={initialData}
          excalidrawAPI={(editor) => {
            api.current = editor;
          }}
          onChange={onChange}
          renderEmbeddable={renderEmbeddable}
          validateEmbeddable={(link) =>
            safeEmbedLink(link, props.snapshot.map.id)
          }
          theme={theme}
          handleKeyboardGlobally={false}
          aiEnabled={false}
          UIOptions={{
            tools: { image: false },
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              saveAsImage: false,
              export: false,
            },
          }}
          onPaste={(data) => {
            const unsupported =
              Object.keys(data.files ?? {}).length > 0 ||
              data.elements?.some(
                (element) =>
                  element.type === "image" ||
                  element.type === "iframe" ||
                  element.type === "magicframe" ||
                  (element.type === "embeddable" &&
                    (() => {
                      const reference = getSceneReference(element);
                      return (
                        !reference ||
                        !options.some(
                          (option) =>
                            referenceKey(option.reference) ===
                            referenceKey(reference),
                        ) ||
                        !element.link ||
                        element.link !==
                          referenceLink(reference, props.snapshot.map.id)
                      );
                    })()),
              ) ||
              data.mixedContent?.some((entry) => entry.type === "imageUrl");
            if (unsupported) blockFiles();
            return !unsupported;
          }}
          onLinkOpen={(element, event) => {
            const reference = getSceneReference(element);
            if (reference?.kind === "topic") {
              event.preventDefault();
              props.onSelect(reference);
            }
          }}
        />
        {trayOpen && (
          <aside
            aria-label="Add study references to board"
            className="absolute inset-y-3 left-3 z-10 flex w-[min(340px,calc(100%-24px))] flex-col rounded-radius-xl border border-border-subtle bg-surface p-3 shadow-lg"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Materials and topics</h3>
              <button
                type="button"
                className={buttonClass}
                onClick={() => setTrayOpen(false)}
              >
                Close
              </button>
            </div>
            <label className="flex flex-col gap-1 text-xs">
              Search materials and topics
              <input
                type="search"
                className={fieldClass}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <p className="my-2 text-xs text-text-tertiary">
              Cards use the original material. Removing a card keeps it in your
              library.
            </p>
            <ul className="min-h-0 flex-1 space-y-2 overflow-auto">
              {filteredOptions.map((option) => {
                const onBoard = nativeElements.some((element) => {
                  const reference = getSceneReference(element);
                  return (
                    reference &&
                    referenceKey(reference) === referenceKey(option.reference)
                  );
                });
                return (
                  <li
                    key={referenceKey(option.reference)}
                    className="rounded-radius-md border border-border-subtle p-2"
                  >
                    <span className="text-xs text-text-tertiary">
                      {option.reference.kind === "topic" ? "Topic" : "Material"}
                    </span>
                    <p className="break-words text-sm font-medium">
                      {option.title}
                    </p>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => addReference(option.reference)}
                    >
                      {onBoard ? "Find on board" : "Add to board"}
                    </button>
                  </li>
                );
              })}
            </ul>
            {filteredOptions.length === 0 && (
              <p className="py-5 text-sm text-text-secondary">
                No materials match this search.
              </p>
            )}
          </aside>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
