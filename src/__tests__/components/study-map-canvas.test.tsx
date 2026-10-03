// @vitest-environment jsdom

import React, { useState, type ComponentProps, type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Node, ReactFlowProps } from "@xyflow/react";
import StudyCanvas from "@/components/study-map/study-canvas";
import {
  boardSchema,
  type StudyBoard,
  type StudyMapSnapshot,
  type StudyMaterial,
  type StudyTopic,
} from "@/lib/study-map/types";

type Selection = ComponentProps<typeof StudyCanvas>["selected"];

const boundary = vi.hoisted(() => ({
  current: null as ReactFlowProps<Node> | null,
  fitView: vi.fn(async () => true),
  setCenter: vi.fn(async () => true),
  getZoom: vi.fn(() => 1),
}));

vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" },
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Handle: () => null,
  ReactFlowProvider: ({ children }: { children: ReactNode }) => children,
  useReactFlow: () => boundary,
  ReactFlow: (props: ReactFlowProps<Node>) => {
    boundary.current = props;
    return (
      <div data-testid="flow">
        {props.nodes?.map((node) => {
          const Card = props.nodeTypes?.[node.type ?? "default"];
          return (
            <div
              key={node.id}
              data-testid={node.id}
              data-x={node.position.x}
              data-y={node.position.y}
              tabIndex={0}
              onClick={(event) => props.onNodeClick?.(event, node)}
              onKeyDown={(event) => {
                if (event.key === "Enter")
                  props.onNodesChange?.([
                    { id: node.id, type: "select", selected: true },
                  ]);
                if (event.key === "Escape")
                  props.onNodesChange?.([
                    { id: node.id, type: "select", selected: false },
                  ]);
                if (event.key === "ArrowRight" && node.draggable !== false)
                  props.onNodesChange?.([
                    {
                      id: node.id,
                      type: "position",
                      position: { x: node.position.x + 15, y: node.position.y },
                      dragging: false,
                    },
                  ]);
              }}
            >
              {Card && (
                <Card
                  id={node.id}
                  data={node.data}
                  type={node.type ?? "default"}
                  selected={node.selected ?? false}
                  dragging={false}
                  isConnectable={false}
                  positionAbsoluteX={node.position.x}
                  positionAbsoluteY={node.position.y}
                  zIndex={node.zIndex ?? 0}
                  selectable={node.selectable ?? true}
                  deletable={false}
                  draggable={node.draggable ?? true}
                />
              )}
            </div>
          );
        })}
        {props.edges?.map((edge) => (
          <div
            key={edge.id}
            data-testid="flow-edge"
            data-source={edge.source}
            data-target={edge.target}
          >
            {edge.label}
          </div>
        ))}
      </div>
    );
  },
}));

const mapId = "10000000-0000-4000-8000-000000000001";
const topicA = "20000000-0000-4000-8000-000000000001";
const topicB = "20000000-0000-4000-8000-000000000002";
const noteA = "30000000-0000-4000-8000-000000000001";
const noteB = "30000000-0000-4000-8000-000000000002";
const noteC = "30000000-0000-4000-8000-000000000003";
const linkId = "40000000-0000-4000-8000-000000000001";
const hash = "a".repeat(64);

function topic(id: string, name: string): StudyTopic {
  return {
    id,
    name,
    definition: `Definition of ${name}`,
    includes: "",
    excludes: "",
    aliases: [],
    parentId: null,
    sources: [],
    reviewed: true,
  };
}

function material(
  noteId: string,
  title: string,
  topicIds: string[],
): StudyMaterial {
  return {
    noteId,
    mapId,
    title,
    excerpt: `An excerpt from ${title}`,
    kind: "notes",
    labels: [],
    associations: topicIds.map((topicId) => ({
      topicId,
      relevance: "core",
      probability: 0.9,
      evidence: [],
      status: "accepted",
      origin: "automatic",
    })),
    overrides: { topics: {}, sourceHash: "", taxonomyVersion: 0 },
    status: "classified",
    sourceHash: hash,
    currentHash: hash,
    taxonomyVersion: 1,
    updatedAt: "2026-10-03T12:00:00Z",
    classifiedAt: "2026-10-03T12:00:00Z",
    isFile: false,
    mimeType: null,
    references: [],
  };
}

function snapshot(): StudyMapSnapshot {
  return {
    map: {
      id: mapId,
      name: "Algorithms",
      academicYear: "2026/27",
      topicCount: 2,
      materialCount: 2,
      updatedAt: "2026-10-03T12:00:00Z",
      rootNoteId: null,
      canvasCourseId: null,
      syllabusNoteId: null,
      taxonomyVersion: 1,
      version: 1,
      boardVersion: 1,
      autoClassify: true,
      topics: [topic(topicA, "Graphs"), topic(topicB, "Complexity")],
      board: {
        placements: [
          { id: `topic:${topicA}`, x: 0, y: 0, pinned: false, topicId: null },
          { id: `topic:${topicB}`, x: 820, y: 0, pinned: false, topicId: null },
          {
            id: `note:${noteA}`,
            x: 147,
            y: 271,
            pinned: true,
            topicId: topicA,
          },
          {
            id: `note:${noteB}`,
            x: 924,
            y: 310,
            pinned: false,
            topicId: topicB,
          },
        ],
        links: [],
        viewport: { x: 80, y: 60, zoom: 0.9 },
      },
    },
    materials: [
      material(noteA, "Graph search", [topicA, topicB]),
      material(noteB, "Runtime analysis", [topicB]),
    ],
    papers: [],
    jobs: [],
    provider: { classifier: "mock", ready: true, generationReady: true },
  };
}

function mount(
  initialSnapshot: StudyMapSnapshot,
  initialSelection: Selection = null,
) {
  const onBoardChange = vi.fn<(board: StudyBoard) => void>();
  const onSelect = vi.fn<(selection: Selection) => void>();
  function Harness({ current }: { current: StudyMapSnapshot }) {
    const [selected, setSelected] = useState<Selection>(initialSelection);
    return (
      <StudyCanvas
        snapshot={current}
        selected={selected}
        onBoardChange={onBoardChange}
        onSelect={(next) => {
          onSelect(next);
          setSelected(next);
        }}
      />
    );
  }
  const result = render(<Harness current={initialSnapshot} />);
  return {
    onBoardChange,
    onSelect,
    refresh: (current: StudyMapSnapshot) =>
      result.rerender(<Harness current={current} />),
  };
}

function lastBoard(
  callback: ReturnType<typeof mount>["onBoardChange"],
): StudyBoard {
  const board = callback.mock.calls.at(-1)?.[0];
  if (!board) throw new Error("Expected a board save");
  expect(boardSchema.safeParse(board).success).toBe(true);
  return board;
}

function renderedEdges() {
  return screen
    .queryAllByTestId("flow-edge")
    .map((edge) => ({
      source: edge.getAttribute("data-source"),
      target: edge.getAttribute("data-target"),
      label: edge.textContent,
    }));
}

beforeEach(() => {
  vi.clearAllMocks();
  boundary.current = null;
  vi.stubGlobal("React", React);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StudyCanvas", () => {
  it("keeps pinned and manually moved positions and the camera when new imports arrive", () => {
    const original = snapshot();
    const view = mount(original, { kind: "note", id: noteB });
    fireEvent.click(screen.getByRole("button", { name: "Move card right" }));
    act(() =>
      boundary.current?.onMoveEnd?.(null, { x: 450, y: -90, zoom: 0.7 }),
    );

    const refreshed = snapshot();
    refreshed.materials[0] = material(noteA, "Graph search", [topicB]);
    refreshed.materials.push(material(noteC, "New lecture", [topicB]));
    view.refresh(refreshed);

    const saved = lastBoard(view.onBoardChange);
    expect(
      saved.placements.find((placement) => placement.id === `note:${noteA}`),
    ).toEqual(original.map.board.placements[2]);
    expect(
      saved.placements.find((placement) => placement.id === `note:${noteB}`),
    ).toMatchObject({ x: 948, y: 310, topicId: topicB });
    expect(
      saved.placements.filter((placement) => placement.id === `note:${noteC}`),
    ).toHaveLength(1);
    expect(saved.viewport).toEqual({ x: 450, y: -90, zoom: 0.7 });
    expect(screen.getAllByTestId(`note:${noteA}`)).toHaveLength(1);
    expect(boundary.current?.defaultViewport).toEqual(
      original.map.board.viewport,
    );
    expect(boundary.current?.fitView).toBe(false);
  });

  it("requires unpinning before click controls or keyboard events can move a card", () => {
    const original = snapshot();
    const view = mount(original, { kind: "note", id: noteA });
    const nudge = screen.getByRole("button", { name: "Move card right" });
    expect(nudge.getAttribute("disabled")).not.toBeNull();
    fireEvent.click(nudge);
    fireEvent.keyDown(screen.getByTestId(`note:${noteA}`), {
      key: "ArrowRight",
    });
    expect(view.onBoardChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Unpin Graph search" }));
    fireEvent.click(screen.getByRole("button", { name: "Move card right" }));
    expect(
      lastBoard(view.onBoardChange).placements.find(
        (placement) => placement.id === `note:${noteA}`,
      ),
    ).toMatchObject({ pinned: false, x: 171, y: 271 });
  });

  it("persists keyboard movement and clears the selected inspector target with Escape", () => {
    const view = mount(snapshot());
    const card = screen.getByTestId(`note:${noteB}`);
    fireEvent.keyDown(card, { key: "Enter" });
    expect(view.onSelect).toHaveBeenLastCalledWith({ kind: "note", id: noteB });
    expect(
      screen.getByRole("button", { name: "Move card right" }),
    ).toBeTruthy();
    fireEvent.keyDown(card, { key: "ArrowRight" });
    expect(
      lastBoard(view.onBoardChange).placements.find(
        (placement) => placement.id === `note:${noteB}`,
      ),
    ).toMatchObject({ x: 939, y: 310 });
    fireEvent.keyDown(card, { key: "Escape" });
    expect(view.onSelect).toHaveBeenLastCalledWith(null);
    expect(
      screen.queryByRole("button", { name: "Move card right" }),
    ).toBeNull();
  });

  it("navigates every associated topic without duplicating or moving the original card", () => {
    const original = snapshot();
    const view = mount(original);
    const card = screen.getByTestId(`note:${noteA}`);
    fireEvent.click(
      within(card).getByRole("button", {
        name: "Show all materials related to Complexity",
      }),
    );

    expect(view.onSelect).toHaveBeenLastCalledWith({
      kind: "topic",
      id: topicB,
    });
    expect(view.onBoardChange).not.toHaveBeenCalled();
    expect(screen.getAllByTestId(`note:${noteA}`)).toHaveLength(1);
    expect(card.getAttribute("data-x")).toBe("147");
    expect(card.querySelector("article")?.className).toContain(
      "ring-primary-500/60",
    );
    expect(renderedEdges()).toEqual(
      expect.arrayContaining([
        { source: `note:${noteA}`, target: `topic:${topicB}`, label: "" },
        { source: `note:${noteB}`, target: `topic:${topicB}`, label: "" },
      ]),
    );
    expect(
      within(card)
        .getByRole("link", { name: "Open original" })
        .getAttribute("href"),
    ).toBe(`/notes/${noteA}`);
  });

  it("changes visual placement without retagging a material or moving its neighbours", () => {
    const original = snapshot();
    original.map.board.placements[2].pinned = false;
    const view = mount(original, { kind: "note", id: noteA });
    fireEvent.change(screen.getByRole("combobox", { name: "Place card" }), {
      target: { value: topicB },
    });
    const saved = lastBoard(view.onBoardChange);
    expect(
      saved.placements.find((placement) => placement.id === `note:${noteA}`)
        ?.topicId,
    ).toBe(topicB);
    expect(
      saved.placements.find((placement) => placement.id === `note:${noteB}`),
    ).toEqual(original.map.board.placements[3]);
    expect(
      screen.getByText("Changes position, not topic membership."),
    ).toBeTruthy();
    const card = screen.getByTestId(`note:${noteA}`);
    expect(
      within(card).getByRole("button", {
        name: "Show all materials related to Graphs",
      }),
    ).toBeTruthy();
    expect(
      within(card).getByRole("button", {
        name: "Show all materials related to Complexity",
      }),
    ).toBeTruthy();
    expect(
      original.materials[0].associations.map(
        (association) => association.topicId,
      ),
    ).toEqual([topicA, topicB]);
  });

  it("creates a labelled link only between distinct existing endpoints and allows removal", () => {
    const view = mount(snapshot(), { kind: "note", id: noteA });
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    const target = screen.getByRole("combobox", { name: "To" });
    expect(
      within(target).queryByRole("option", { name: "Graph search" }),
    ).toBeNull();
    fireEvent.change(target, { target: { value: `note:${noteB}` } });
    fireEvent.change(screen.getByRole("textbox", { name: "Relationship" }), {
      target: { value: "  analysed by  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));
    const saved = lastBoard(view.onBoardChange);
    expect(saved.links).toHaveLength(1);
    expect(saved.links[0]).toMatchObject({
      source: `note:${noteA}`,
      target: `note:${noteB}`,
      label: "analysed by",
    });
    expect(renderedEdges()).toEqual(
      expect.arrayContaining([
        {
          source: `note:${noteA}`,
          target: `note:${noteB}`,
          label: "analysed by",
        },
      ]),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove link analysed by" }),
    );
    expect(lastBoard(view.onBoardChange).links).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Relationship" })).toBeNull();
  });

  it("does not resend a link to a material that was removed while the map stayed open", () => {
    const original = snapshot();
    original.map.board.links = [
      {
        id: linkId,
        source: `note:${noteA}`,
        target: `note:${noteB}`,
        label: "analysed by",
      },
    ];
    const view = mount(original, { kind: "note", id: noteA });
    const refreshed = snapshot();
    refreshed.materials = [refreshed.materials[0]];
    refreshed.map.board.placements = refreshed.map.board.placements.filter(
      (placement) => placement.id !== `note:${noteB}`,
    );
    view.refresh(refreshed);
    expect(
      renderedEdges().some((edge) => edge.target === `note:${noteB}`),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Unpin Graph search" }));
    expect(lastBoard(view.onBoardChange).links).toEqual([]);
  });
});
