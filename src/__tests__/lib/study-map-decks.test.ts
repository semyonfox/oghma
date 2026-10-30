import { describe, expect, it } from "vitest";
import {
  DECK_COLUMNS,
  DECK_COLUMNS_NARROW,
  deckTier,
  fanPositions,
  layoutDecks,
} from "@/lib/study-map/decks";
import type { FlowCluster } from "@/lib/study-map/flow";
import type { StudyTopic } from "@/lib/study-map/types";

const cluster = (key: string, files: number, sorted = true): FlowCluster => ({
  key,
  topic: sorted ? ({ id: key, name: key } as StudyTopic) : null,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  refs: Array.from({ length: files }, (_, index) => `note:${key}${index}`),
});

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

describe("layoutDecks", () => {
  const marks = new Map([
    ["big", 50],
    ["middle", 8],
    ["tiny", 2],
  ]);
  const clusters = [
    cluster("tiny", 12),
    cluster("big", 2),
    cluster("middle", 4),
    cluster("unexamined", 6),
  ];

  it("sizes decks by exam marks rather than by how many files they hold", () => {
    const { decks } = layoutDecks(clusters, marks);
    const tier = (key: string) => decks.find((deck) => deck.key === key)?.tier;
    expect(tier("big")).toBe("large");
    expect(tier("middle")).toBe("medium");
    expect(tier("tiny")).toBe("small");
  });

  it("thickens a deck by file count, whatever its size", () => {
    const { decks } = layoutDecks(clusters, marks);
    const layers = (key: string) =>
      decks.find((deck) => deck.key === key)?.layers;
    expect(layers("tiny")).toBe(2);
    expect(layers("unexamined")).toBe(1);
    expect(layers("big")).toBe(0);
  });

  it("marks a topic no paper covers as unknown instead of zero", () => {
    const { decks } = layoutDecks(clusters, marks);
    expect(decks.find((deck) => deck.key === "unexamined")?.share).toBeNull();
    expect(decks.find((deck) => deck.key === "big")?.share).toBeCloseTo(50 / 60);
  });

  it("falls back to file share when the module has no reviewed papers", () => {
    const { decks } = layoutDecks(
      [cluster("many", 20), cluster("few", 1)],
      new Map(),
    );
    expect(decks.map((deck) => [deck.key, deck.tier, deck.share])).toEqual([
      ["many", "large", null],
      ["few", "small", null],
    ]);
  });

  it("puts the heaviest first and anything unsorted last", () => {
    const { decks } = layoutDecks(
      [cluster("unsorted", 30, false), ...clusters],
      marks,
    );
    expect(decks[0].key).toBe("big");
    expect(decks.at(-1)?.key).toBe("unsorted");
  });

  it.each([DECK_COLUMNS, DECK_COLUMNS_NARROW])(
    "never overlaps twenty topics in %i columns, and stays on the table",
    (columns) => {
      const many = Array.from({ length: 20 }, (_, index) =>
        cluster(`topic${index}`, index),
      );
      const weights = new Map(
        many.map((entry, index) => [entry.key, 20 - index] as const),
      );
      const { decks, width, height } = layoutDecks(many, weights, columns);
      for (const [index, deck] of decks.entries()) {
        expect(deck.x + deck.width).toBeLessThanOrEqual(width);
        expect(deck.y + deck.height).toBeLessThanOrEqual(height);
        for (const other of decks.slice(index + 1))
          expect(overlaps(deck, other)).toBe(false);
      }
    },
  );
});

describe("deckTier", () => {
  it("only ever returns three sizes, split at 18% and 8%", () => {
    expect([0.18, 0.1799, 0.08, 0.0799].map(deckTier)).toEqual([
      "large",
      "medium",
      "medium",
      "small",
    ]);
  });
});

describe("fanPositions", () => {
  it("keeps every card on the table and wraps when it is narrow", () => {
    const narrow = fanPositions({ x: 620, y: 0 }, 5, 1180);
    for (const slot of narrow) {
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.x + 440).toBeLessThanOrEqual(1180);
    }
    expect(new Set(narrow.map((slot) => Math.floor(slot.y / 600))).size).toBe(3);
  });
});
