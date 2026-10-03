"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type Viewport,
} from "@xyflow/react";
import {
  effectiveAssociations,
  type BoardPlacement,
  type StudyBoard,
  type StudyMapSnapshot,
  type StudyMaterial,
  type StudyTopic,
} from "@/lib/study-map/types";

type Selection = { kind: "note" | "topic"; id: string };
interface StudyCanvasProps {
  snapshot: StudyMapSnapshot;
  selected: Selection | null;
  onSelect: (selection: Selection | null) => void;
  onBoardChange: (board: StudyBoard) => void;
}
type TopicBadge = { id: string; name: string; suggested: boolean };
type NoteData = {
  material: StudyMaterial;
  topics: TopicBadge[];
  pinned: boolean;
  highlighted: boolean;
  reviewed: boolean;
  onSelect: StudyCanvasProps["onSelect"];
  onPin: (id: string) => void;
};
type RegionData = {
  topic: StudyTopic | null;
  count: number;
  onSelect: StudyCanvasProps["onSelect"];
};
type NoteNode = Node<NoteData, "material">;
type RegionNode = Node<RegionData, "region">;
type CanvasNode = NoteNode | RegionNode;

const CARD_WIDTH = 304;
const CARD_SPACE_X = 336;
const CARD_SPACE_Y = 300;
const REGION_WIDTH = 724;
const UNASSIGNED_POSITION = { x: -820, y: 0 };
const actionClass =
  "nodrag nopan rounded-radius-md px-2 py-1 text-xs font-medium text-text-secondary hover:bg-primary-500/10 hover:text-primary-500 focus-visible:outline-2 focus-visible:outline-primary-500";
const fieldClass =
  "min-w-0 rounded-radius-md border border-border-subtle bg-surface px-2 py-1.5 text-base text-text md:text-sm focus-visible:outline-2 focus-visible:outline-primary-500";

const NoteCard = memo(function NoteCard({
  data,
  selected,
}: NodeProps<NoteNode>) {
  const badges = data.topics.slice(0, 3);
  return (
    <article
      className={`rounded-radius-xl bg-surface p-4 text-text shadow-sm ${selected ? "ring-2 ring-primary-500" : data.highlighted ? "ring-2 ring-primary-500/60" : "border border-border-subtle"}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="opacity-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="opacity-0"
      />
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs text-text-tertiary">
          {data.material.kind.replaceAll("_", " ")}
          {data.material.isFile ? " · attachment" : ""}
        </span>
        {data.pinned && (
          <span className="text-xs font-medium text-primary-500">Pinned</span>
        )}
      </div>
      <h3 className="mt-2 break-words text-base font-semibold leading-snug">
        {data.material.title || "Untitled note"}
      </h3>
      <p className="mt-2 line-clamp-3 break-words text-sm text-text-secondary">
        {data.material.excerpt || "Open the original material to read it."}
      </p>
      {badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {badges.map((topic) => (
            <button
              key={topic.id}
              type="button"
              className={`${actionClass} bg-primary-500/5 text-left`}
              onClick={(event) => {
                event.stopPropagation();
                data.onSelect({ kind: "topic", id: topic.id });
              }}
              aria-label={`Show all materials related to ${topic.name}`}
            >
              {topic.name}
              {topic.suggested ? " · suggested" : ""}
            </button>
          ))}
          {data.topics.length > badges.length && (
            <button
              type="button"
              className={actionClass}
              onClick={(event) => {
                event.stopPropagation();
                data.onSelect({ kind: "note", id: data.material.noteId });
              }}
            >
              +{data.topics.length - badges.length} topics
            </button>
          )}
        </div>
      )}
      {data.material.status !== "classified" && (
        <p className="mt-2 text-xs text-text-tertiary">
          {data.reviewed ? "Reviewed by you" : data.material.status === "stale"
            ? "Classification needs review"
            : data.material.status === "failed"
              ? "Classification failed"
              : "Awaiting classification"}
        </p>
      )}
      {data.material.references.length > 0 && (
        <p className="mt-2 text-xs text-text-tertiary">
          {data.material.references.length} linked{" "}
          {data.material.references.length === 1 ? "material" : "materials"}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
        <Link
          className={actionClass}
          href={`/notes/${data.material.noteId}`}
          onClick={(event) => event.stopPropagation()}
        >
          Open original
        </Link>
        <button
          type="button"
          className={actionClass}
          aria-pressed={data.pinned}
          aria-label={`${data.pinned ? "Unpin" : "Pin"} ${data.material.title}`}
          onClick={(event) => {
            event.stopPropagation();
            data.onPin(`note:${data.material.noteId}`);
          }}
        >
          {data.pinned ? "Unpin" : "Pin"}
        </button>
      </div>
    </article>
  );
});

const TopicRegion = memo(function TopicRegion({
  data,
  selected,
}: NodeProps<RegionNode>) {
  return (
    <section
      className={`h-full rounded-radius-2xl border bg-primary-500/5 p-4 text-text ${selected ? "border-primary-500 ring-1 ring-primary-500" : "border-border-subtle"}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="opacity-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="opacity-0"
      />
      {data.topic ? (
        <button
          type="button"
          className={`${actionClass} max-w-full text-left text-base font-semibold text-text`}
          onClick={(event) => {
            event.stopPropagation();
            if (data.topic) data.onSelect({ kind: "topic", id: data.topic.id });
          }}
        >
          {data.topic.name}
        </button>
      ) : (
        <h3 className="text-base font-semibold">Unassigned</h3>
      )}
      <p className="mt-1 text-xs text-text-secondary">
        {data.topic
          ? `${data.count} related ${data.count === 1 ? "material" : "materials"} across the map`
          : "Materials without a visual topic placement"}
      </p>
    </section>
  );
});

const nodeTypes = {
  material: NoteCard,
  region: TopicRegion,
} satisfies NodeTypes;

function selectionFor(id: string): Selection | null {
  if (id.startsWith("note:")) return { kind: "note", id: id.slice(5) };
  if (id.startsWith("topic:")) return { kind: "topic", id: id.slice(6) };
  return null;
}

function strongestTopic(
  material: StudyMaterial,
  snapshot: StudyMapSnapshot,
): string | null {
  const validTopics = new Set(snapshot.map.topics.map((topic) => topic.id));
  return (
    effectiveAssociations(material, snapshot.map.taxonomyVersion)
      .filter((association) => validTopics.has(association.topicId))
      .sort(
        (a, b) =>
          Number(b.status === "accepted") - Number(a.status === "accepted") ||
          Number(b.relevance === "core") - Number(a.relevance === "core") ||
          (b.probability ?? 0) - (a.probability ?? 0),
      )[0]?.topicId ?? null
  );
}

function fillPlacements(
  board: StudyBoard,
  snapshot: StudyMapSnapshot,
): StudyBoard {
  const placements = [...board.placements];
  const existing = new Map(
    placements.map((placement) => [placement.id, placement]),
  );
  snapshot.map.topics.forEach((topic, index) => {
    const id = `topic:${topic.id}`;
    if (existing.has(id)) return;
    const rightmostRegion = Math.max(
      -820,
      ...placements
        .filter((entry) => entry.id.startsWith("topic:"))
        .map((entry) => entry.x),
    );
    const placement: BoardPlacement = {
      id,
      x: Math.max(index * 820, rightmostRegion + 820),
      y: 0,
      pinned: false,
      topicId: null,
    };
    placements.push(placement);
    existing.set(id, placement);
  });
  for (const material of snapshot.materials) {
    const id = `note:${material.noteId}`;
    if (existing.has(id)) continue;
    const topicId = strongestTopic(material, snapshot);
    const region = topicId ? existing.get(`topic:${topicId}`) : undefined;
    const anchor = region ?? UNASSIGNED_POSITION;
    let slot = 0;
    let position = { x: anchor.x + 24, y: anchor.y + 92 };
    while (
      placements.some(
        (placement) =>
          placement.id.startsWith("note:") &&
          Math.abs(placement.x - position.x) < CARD_SPACE_X &&
          Math.abs(placement.y - position.y) < CARD_SPACE_Y,
      )
    ) {
      slot += 1;
      position = {
        x: anchor.x + 24 + (slot % 2) * CARD_SPACE_X,
        y: anchor.y + 92 + Math.floor(slot / 2) * CARD_SPACE_Y,
      };
    }
    const placement: BoardPlacement = {
      id,
      ...position,
      pinned: false,
      topicId,
    };
    placements.push(placement);
    existing.set(id, placement);
  }
  return placements.length === board.placements.length
    ? board
    : { ...board, placements };
}

function cleanBoard(board: StudyBoard, validIds: Set<string>): StudyBoard {
  const placements = board.placements
    .filter((placement) => validIds.has(placement.id))
    .map((placement) =>
      placement.topicId && !validIds.has(`topic:${placement.topicId}`)
        ? { ...placement, topicId: null }
        : placement,
    );
  const links = board.links.filter(
    (link) => validIds.has(link.source) && validIds.has(link.target),
  );
  if (
    placements.length === board.placements.length &&
    links.length === board.links.length &&
    placements.every(
      (placement, index) => placement === board.placements[index],
    )
  )
    return board;
  return { ...board, placements, links };
}

function Canvas({
  snapshot,
  selected,
  onSelect,
  onBoardChange,
}: StudyCanvasProps) {
  const [board, setBoard] = useState(() =>
    fillPlacements(snapshot.map.board, snapshot),
  );
  const boardRef = useRef(board);
  const changeRef = useRef(onBoardChange);
  const validIds = useMemo(
    () =>
      new Set([
        ...snapshot.map.topics.map((topic) => `topic:${topic.id}`),
        ...snapshot.materials.map((material) => `note:${material.noteId}`),
      ]),
    [snapshot.map.topics, snapshot.materials],
  );
  const validIdsRef = useRef(validIds);
  validIdsRef.current = validIds;
  const initialViewport = useRef(snapshot.map.board.viewport);
  const initialSaveNeeded = useRef(
    board.placements.length !== snapshot.map.board.placements.length,
  );
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkSource, setLinkSource] = useState("");
  const [linkTarget, setLinkTarget] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const flow = useReactFlow<CanvasNode>();
  changeRef.current = onBoardChange;

  const updateBoard = useCallback(
    (update: (current: StudyBoard) => StudyBoard) => {
      const next = cleanBoard(update(boardRef.current), validIdsRef.current);
      if (next === boardRef.current) return;
      boardRef.current = next;
      setBoard(next);
      changeRef.current(next);
    },
    [],
  );

  useEffect(() => {
    // classification refreshes add cards without replacing local positions or the camera
    const next = fillPlacements(boardRef.current, snapshot);
    if (next !== boardRef.current) updateBoard(() => next);
  }, [snapshot, updateBoard]);

  useEffect(() => {
    // initial generated positions must be saved before a later import changes the layout
    if (initialSaveNeeded.current) {
      initialSaveNeeded.current = false;
      updateBoard((current) => ({ ...current }));
    }
  }, [updateBoard]);

  const placementById = useMemo(
    () =>
      new Map(board.placements.map((placement) => [placement.id, placement])),
    [board.placements],
  );
  const topicsById = useMemo(
    () => new Map(snapshot.map.topics.map((topic) => [topic.id, topic])),
    [snapshot.map.topics],
  );
  const associationsByNote = useMemo(
    () =>
      new Map(
        snapshot.materials.map((material) => [
          material.noteId,
          effectiveAssociations(material, snapshot.map.taxonomyVersion).filter(
            (association) => topicsById.has(association.topicId),
          ),
        ]),
      ),
    [snapshot.materials, snapshot.map.taxonomyVersion, topicsById],
  );
  const selectedNodeId = selected ? `${selected.kind}:${selected.id}` : null;
  const selectedPlacement = selectedNodeId
    ? placementById.get(selectedNodeId)
    : undefined;
  const selectedMaterial =
    selected?.kind === "note"
      ? snapshot.materials.find((material) => material.noteId === selected.id)
      : undefined;

  const togglePin = useCallback(
    (id: string) => {
      const placement = boardRef.current.placements.find(
        (entry) => entry.id === id,
      );
      if (!placement) return;
      updateBoard((current) => ({
        ...current,
        placements: current.placements.map((placement) =>
          placement.id === id
            ? { ...placement, pinned: !placement.pinned }
            : placement,
        ),
      }));
      setAnnouncement(placement.pinned ? "Card unpinned" : "Card pinned");
    },
    [updateBoard],
  );

  const nodes = useMemo<CanvasNode[]>(() => {
    const result: CanvasNode[] = [];
    for (const topic of snapshot.map.topics) {
      const placement = placementById.get(`topic:${topic.id}`);
      if (!placement) continue;
      const contained = board.placements.filter(
        (entry) =>
          validIds.has(entry.id) &&
          entry.id.startsWith("note:") &&
          entry.topicId === topic.id,
      );
      const width = Math.max(
        REGION_WIDTH,
        ...contained.map((entry) => entry.x - placement.x + CARD_WIDTH + 24),
      );
      const height = Math.max(
        420,
        ...contained.map((entry) => entry.y - placement.y + CARD_SPACE_Y),
      );
      result.push({
        id: placement.id,
        type: "region",
        position: { x: placement.x, y: placement.y },
        data: {
          topic,
          count: [...associationsByNote.values()].filter((associations) =>
            associations.some(
              (association) => association.topicId === topic.id,
            ),
          ).length,
          onSelect,
        },
        style: { width, height },
        draggable: false,
        selectable: true,
        selected: selectedNodeId === placement.id,
        zIndex: -1,
        ariaLabel: `Topic: ${topic.name}`,
      });
    }
    const unassignedPosition = UNASSIGNED_POSITION;
    const unassigned = snapshot.materials.filter((material) => {
      const placement = placementById.get(`note:${material.noteId}`);
      return (
        placement && (!placement.topicId || !topicsById.has(placement.topicId))
      );
    });
    if (unassigned.length > 0) {
      result.push({
        id: "unassigned",
        type: "region",
        position: unassignedPosition,
        data: { topic: null, count: unassigned.length, onSelect },
        draggable: false,
        selectable: false,
        focusable: false,
        style: {
          width: REGION_WIDTH,
          height: Math.max(
            420,
            ...unassigned.map(
              (material) =>
                (placementById.get(`note:${material.noteId}`)?.y ??
                  unassignedPosition.y) -
                unassignedPosition.y +
                CARD_SPACE_Y,
            ),
          ),
        },
        zIndex: -1,
      });
    }
    for (const material of snapshot.materials) {
      const placement = placementById.get(`note:${material.noteId}`);
      if (!placement) continue;
      const associations = associationsByNote.get(material.noteId) ?? [];
      const topics = associations.flatMap((association) => {
        const topic = topicsById.get(association.topicId);
        return topic
          ? [
              {
                id: topic.id,
                name: topic.name,
                suggested: association.status === "suggested",
              },
            ]
          : [];
      });
      result.push({
        id: placement.id,
        type: "material",
        position: { x: placement.x, y: placement.y },
        data: {
          material,
          reviewed: material.overrides.sourceHash === material.currentHash
            && material.overrides.taxonomyVersion === snapshot.map.taxonomyVersion
            && !material.taxonomyEvidenceStale,
          topics,
          pinned: placement.pinned,
          highlighted:
            selected?.kind === "topic" &&
            associations.some(
              (association) => association.topicId === selected.id,
            ),
          onSelect,
          onPin: togglePin,
        },
        style: { width: CARD_WIDTH },
        draggable: !placement.pinned,
        selected: selectedNodeId === placement.id,
        ariaLabel: `${material.title || "Untitled note"}, ${material.kind.replaceAll("_", " ")}${placement.pinned ? ", pinned" : ""}`,
      });
    }
    return result;
  }, [
    snapshot.map.topics,
    snapshot.map.taxonomyVersion,
    snapshot.materials,
    placementById,
    board.placements,
    associationsByNote,
    selected,
    selectedNodeId,
    onSelect,
    togglePin,
    topicsById,
    validIds,
  ]);

  const edges = useMemo<Edge[]>(() => {
    const visibleIds = new Set(nodes.map((node) => node.id));
    const result: Edge[] = board.links
      .filter(
        (link) => visibleIds.has(link.source) && visibleIds.has(link.target),
      )
      .map((link) => ({
        ...link,
        type: "smoothstep",
        label: link.label,
        className: "text-primary-500",
        style: { stroke: "currentColor", strokeWidth: 2 },
        labelStyle: { fill: "currentColor", fontSize: 12 },
        labelShowBg: false,
        ariaLabel: `Manual link: ${link.label}`,
        focusable: true,
        selectable: false,
      }));
    for (const material of snapshot.materials) {
      for (const association of associationsByNote.get(material.noteId) ?? []) {
        if (
          !(
            selected?.kind === "topic" && selected.id === association.topicId
          ) &&
          !(selected?.kind === "note" && selected.id === material.noteId)
        )
          continue;
        result.push({
          id: `membership:${material.noteId}:${association.topicId}`,
          source: `note:${material.noteId}`,
          target: `topic:${association.topicId}`,
          type: "smoothstep",
          className: "text-primary-500",
          style: {
            stroke: "currentColor",
            strokeWidth: 1,
            strokeDasharray: "4 6",
            opacity: 0.45,
          },
          focusable: false,
          selectable: false,
          zIndex: -1,
        });
      }
    }
    return result;
  }, [board.links, nodes, snapshot.materials, associationsByNote, selected]);

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      const selectionChange = changes.find(
        (change) => change.type === "select" && change.selected,
      );
      if (selectionChange?.type === "select") {
        const selection = selectionFor(selectionChange.id);
        if (selection) onSelect(selection);
      } else if (
        changes.some(
          (change) =>
            change.type === "select" &&
            !change.selected &&
            change.id === selectedNodeId,
        )
      ) {
        onSelect(null);
      }
      const positions = new Map(
        changes.flatMap((change) =>
          change.type === "position" && change.position
            ? [[change.id, change.position] as const]
            : [],
        ),
      );
      if (positions.size === 0) return;
      updateBoard((current) => ({
        ...current,
        placements: current.placements.map((placement) => {
          const position = positions.get(placement.id);
          return position &&
            !placement.pinned &&
            placement.id.startsWith("note:")
            ? {
                ...placement,
                x: Math.max(-100000, Math.min(100000, position.x)),
                y: Math.max(-100000, Math.min(100000, position.y)),
              }
            : placement;
        }),
      }));
    },
    [onSelect, selectedNodeId, updateBoard],
  );

  const saveViewport = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      updateBoard((current) => ({
        ...current,
        viewport: {
          x: Math.max(-1000000, Math.min(1000000, viewport.x)),
          y: Math.max(-1000000, Math.min(1000000, viewport.y)),
          zoom: viewport.zoom,
        },
      }));
    },
    [updateBoard],
  );

  const nudge = useCallback(
    (x: number, y: number) => {
      if (!selectedNodeId || !selectedPlacement || selectedPlacement.pinned)
        return;
      updateBoard((current) => ({
        ...current,
        placements: current.placements.map((placement) =>
          placement.id === selectedNodeId
            ? {
                ...placement,
                x: Math.max(-100000, Math.min(100000, placement.x + x)),
                y: Math.max(-100000, Math.min(100000, placement.y + y)),
              }
            : placement,
        ),
      }));
      setAnnouncement(
        `Card moved to ${Math.round(selectedPlacement.x + x)}, ${Math.round(selectedPlacement.y + y)}`,
      );
    },
    [selectedNodeId, selectedPlacement, updateBoard],
  );

  function placeCard(topicId: string | null) {
    if (!selectedNodeId || !selectedPlacement || selectedPlacement.pinned)
      return;
    const region = topicId ? placementById.get(`topic:${topicId}`) : undefined;
    const x = region?.x ?? UNASSIGNED_POSITION.x;
    const y = region?.y ?? UNASSIGNED_POSITION.y;
    let slot = 0;
    let position = { x: x + 24, y: y + 92 };
    while (
      board.placements.some(
        (placement) =>
          placement.id !== selectedNodeId &&
          placement.id.startsWith("note:") &&
          Math.abs(placement.x - position.x) < CARD_SPACE_X &&
          Math.abs(placement.y - position.y) < CARD_SPACE_Y,
      )
    ) {
      slot += 1;
      position = {
        x: x + 24 + (slot % 2) * CARD_SPACE_X,
        y: y + 92 + Math.floor(slot / 2) * CARD_SPACE_Y,
      };
    }
    updateBoard((current) => ({
      ...current,
      placements: current.placements.map((placement) =>
        placement.id === selectedNodeId
          ? { ...placement, ...position, topicId }
          : placement,
      ),
    }));
    setAnnouncement("Visual placement changed. Topic membership is unchanged.");
    void flow.setCenter(position.x + CARD_WIDTH / 2, position.y + 120, {
      zoom: flow.getZoom(),
      duration: 0,
    });
  }

  const linkOptions = useMemo(
    () => [
      ...snapshot.map.topics.map((topic) => ({
        id: `topic:${topic.id}`,
        title: `Topic · ${topic.name}`,
      })),
      ...snapshot.materials.map((material) => ({
        id: `note:${material.noteId}`,
        title: material.title || "Untitled note",
      })),
    ],
    [snapshot.map.topics, snapshot.materials],
  );
  const activeLinks = board.links.filter(
    (link) =>
      validIds.has(link.source) &&
      validIds.has(link.target) &&
      (link.source === selectedNodeId || link.target === selectedNodeId),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-radius-xl border border-border-subtle bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface px-3 py-2">
        <button
          type="button"
          className={actionClass}
          onClick={() => void flow.fitView({ duration: 0, padding: 0.15 })}
        >
          Fit map
        </button>
        <button
          type="button"
          className={actionClass}
          disabled={!selectedNodeId}
          onClick={() => {
            if (selectedNodeId)
              void flow.fitView({
                nodes: [{ id: selectedNodeId }],
                duration: 0,
                maxZoom: 1,
                padding: 0.3,
              });
          }}
        >
          Find selected
        </button>
        <button
          type="button"
          className={actionClass}
          onClick={() => {
            setLinkSource(selectedNodeId ?? "");
            setLinkTarget("");
            setLinkLabel("");
            setLinkOpen(true);
          }}
        >
          Add link
        </button>
        <span className="ml-auto text-xs text-text-tertiary">
          Drag to place · scroll to zoom
        </span>
      </div>
      {linkOpen && (
        <form
          className="flex flex-wrap items-end gap-2 border-b border-border-subtle bg-surface p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const label = linkLabel.trim();
            if (
              !label ||
              !linkSource ||
              !linkTarget ||
              linkSource === linkTarget ||
              !linkOptions.some((option) => option.id === linkSource) ||
              !linkOptions.some((option) => option.id === linkTarget) ||
              board.links.length >= 1000
            )
              return;
            updateBoard((current) => ({
              ...current,
              links: [
                ...current.links,
                {
                  id: crypto.randomUUID(),
                  source: linkSource,
                  target: linkTarget,
                  label,
                },
              ],
            }));
            setLinkOpen(false);
            setAnnouncement("Link added");
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-text-secondary">
            From
            <select
              required
              className={fieldClass}
              value={linkSource}
              onChange={(event) => setLinkSource(event.target.value)}
            >
              <option value="">Choose a card or topic</option>
              {linkOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-text-secondary">
            To
            <select
              required
              className={fieldClass}
              value={linkTarget}
              onChange={(event) => setLinkTarget(event.target.value)}
            >
              <option value="">Choose a card or topic</option>
              {linkOptions
                .filter((option) => option.id !== linkSource)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-text-secondary">
            Relationship
            <input
              className={fieldClass}
              required
              maxLength={80}
              placeholder="e.g. explains this example"
              value={linkLabel}
              onChange={(event) => setLinkLabel(event.target.value)}
            />
          </label>
          <button
            className={actionClass}
            type="submit"
            disabled={
              !linkSource ||
              !linkTarget ||
              linkSource === linkTarget ||
              !linkLabel.trim() ||
              board.links.length >= 1000
            }
          >
            Save link
          </button>
          <button
            className={actionClass}
            type="button"
            onClick={() => setLinkOpen(false)}
          >
            Cancel
          </button>
        </form>
      )}
      {selectedMaterial && selectedPlacement && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface px-3 py-2">
          <span className="max-w-48 truncate text-sm font-medium text-text">
            {selectedMaterial.title}
          </span>
          <div
            className="flex gap-1"
            role="group"
            aria-label="Move selected card"
          >
            {[
              { label: "Move card left", glyph: "←", x: -24, y: 0 },
              { label: "Move card up", glyph: "↑", x: 0, y: -24 },
              { label: "Move card down", glyph: "↓", x: 0, y: 24 },
              { label: "Move card right", glyph: "→", x: 24, y: 0 },
            ].map((direction) => (
              <button
                key={direction.label}
                type="button"
                aria-label={direction.label}
                disabled={selectedPlacement.pinned}
                className={`${actionClass} min-h-11 min-w-11 disabled:opacity-40 lg:min-h-8 lg:min-w-8`}
                onClick={() => nudge(direction.x, direction.y)}
              >
                {direction.glyph}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            Place card
            <select
              className={fieldClass}
              aria-describedby="study-placement-help"
              disabled={selectedPlacement.pinned}
              value={
                selectedPlacement.topicId &&
                topicsById.has(selectedPlacement.topicId)
                  ? selectedPlacement.topicId
                  : ""
              }
              onChange={(event) => placeCard(event.target.value || null)}
            >
              <option value="">Unassigned area</option>
              {snapshot.map.topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </label>
          <span
            id="study-placement-help"
            className="text-xs text-text-tertiary"
          >
            Changes position, not topic membership.
            {selectedPlacement.pinned ? " Unpin to move." : ""}
          </span>
        </div>
      )}
      {activeLinks.length > 0 && (
        <div
          className="flex max-h-28 flex-wrap gap-2 overflow-auto border-b border-border-subtle bg-surface px-3 py-2"
          aria-label="Links for selection"
        >
          {activeLinks.map((link) => (
            <div
              key={link.id}
              className="flex items-center gap-1 rounded-radius-md border border-border-subtle pl-2 text-xs text-text-secondary"
            >
              <span>{link.label}</span>
              <button
                type="button"
                className={actionClass}
                aria-label={`Remove link ${link.label}`}
                onClick={() => {
                  updateBoard((current) => ({
                    ...current,
                    links: current.links.filter(
                      (entry) => entry.id !== link.id,
                    ),
                  }));
                  setAnnouncement("Link removed");
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        className="relative h-[65vh] min-h-[480px] flex-none"
        role="region"
        aria-label="Study map canvas"
        aria-describedby="study-canvas-help"
      >
        <ReactFlow<CanvasNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_event, node) => {
            const selection = selectionFor(node.id);
            if (selection) onSelect(selection);
          }}
          onPaneClick={() => onSelect(null)}
          onMoveEnd={saveViewport}
          defaultViewport={
            initialViewport.current ?? { x: 30, y: 30, zoom: 0.8 }
          }
          fitView={!initialViewport.current}
          minZoom={0.1}
          maxZoom={3}
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          multiSelectionKeyCode={null}
          selectionOnDrag={false}
          proOptions={{ hideAttribution: true }}
          ariaLabelConfig={{
            "node.a11yDescription.default":
              "Press Enter to select this material or topic. Use arrow keys to move an unpinned material. Escape clears the selection.",
          }}
        >
          <Background
            color="currentColor"
            className="text-text-tertiary/20"
            gap={24}
            size={1}
          />
          <Controls
            showInteractive={false}
            fitViewOptions={{ duration: 0 }}
            className="text-text [&>button]:bg-surface [&>button]:text-text"
          />
          <MiniMap
            pannable
            zoomable
            className="hidden bg-surface text-primary-500 sm:block"
            bgColor="transparent"
            maskColor="transparent"
            nodeColor="currentColor"
            nodeStrokeColor="currentColor"
            nodeClassName={(node) =>
              node.type === "region" ? "opacity-20" : "opacity-70"
            }
            ariaLabel="Study map overview"
          />
        </ReactFlow>
        {snapshot.materials.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
            <p className="max-w-sm rounded-radius-xl bg-surface p-5 text-center text-sm text-text-secondary">
              Add existing notes or attachments to begin arranging your study
              map.
            </p>
          </div>
        )}
      </div>
      <p
        id="study-canvas-help"
        className="border-t border-border-subtle bg-surface px-3 py-2 text-xs text-text-tertiary"
      >
        Tab to a card, Enter to select, arrow keys to move, Shift for larger
        steps. Pinned cards stay in place. Topic regions stay fixed.
      </p>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}

export default function StudyCanvas(props: StudyCanvasProps) {
  return (
    <ReactFlowProvider key={props.snapshot.map.id}>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
