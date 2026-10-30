import type { FlowCluster } from "./flow";

// the table lives in its own world coordinates, sized for roughly a third of real size on a laptop
export const DECK_CELL_WIDTH = 560;
export const DECK_CELL_HEIGHT = 300;
export const DECK_GAP = 60;
export const DECK_TABLE_TOP = 170;
export const DECK_MODULE_GAP = 220;
export const DECK_COLUMNS = 6;
export const DECK_COLUMNS_NARROW = 2;

export type DeckTier = "large" | "medium" | "small";

const SPANS: Record<DeckTier, { columns: number; rows: number }> = {
  large: { columns: 2, rows: 2 },
  medium: { columns: 2, rows: 1 },
  small: { columns: 1, rows: 1 },
};

export interface Deck {
  /** unique across modules: every module can have its own unsorted deck */
  id: string;
  /** the cluster this deck stands for */
  key: string;
  cluster: FlowCluster;
  tier: DeckTier;
  /** share of the module's exam marks, null when no reviewed paper covers this topic */
  share: number | null;
  /** how many cards show under the top one */
  layers: 0 | 1 | 2;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DeckTable {
  decks: Deck[];
  width: number;
  height: number;
}

/**
 * Three sizes only, so a module can't turn into a jumble. Size is the share of
 * exam marks. A module with no reviewed papers has nothing to size by, so it
 * falls back to its share of files.
 */
export function deckTier(share: number): DeckTier {
  if (share >= 0.18) return "large";
  if (share >= 0.08) return "medium";
  return "small";
}

export function layoutDecks(
  clusters: FlowCluster[],
  marks: ReadonlyMap<string, number>,
  columns = DECK_COLUMNS,
): DeckTable {
  const totalMarks = [...marks.values()].reduce((sum, value) => sum + value, 0);
  const totalFiles = clusters.reduce((sum, c) => sum + c.refs.length, 0);
  const sized = clusters.map((cluster) => {
    const topicMarks = marks.get(cluster.key) ?? 0;
    const share =
      totalMarks > 0 && topicMarks > 0 ? topicMarks / totalMarks : null;
    const weight =
      totalMarks > 0
        ? (share ?? 0)
        : totalFiles > 0
          ? cluster.refs.length / totalFiles
          : 0;
    // unsorted isn't a topic, so it never gets to look like the most important one
    const tier = deckTier(weight);
    return {
      cluster,
      share,
      tier: cluster.topic === null && tier === "large" ? ("medium" as const) : tier,
      weight,
    };
  });
  // heaviest first, and anything not sorted yet always last
  const ordered = sized
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        Number(a.entry.cluster.topic === null) -
          Number(b.entry.cluster.topic === null) ||
        b.entry.weight - a.entry.weight ||
        b.entry.cluster.refs.length - a.entry.cluster.refs.length ||
        a.index - b.index,
    )
    .map(({ entry }) => entry);

  const taken = new Set<string>();
  const free = (column: number, row: number, span: DeckSpan) => {
    if (column + span.columns > columns) return false;
    for (let c = column; c < column + span.columns; c++)
      for (let r = row; r < row + span.rows; r++)
        if (taken.has(`${c}:${r}`)) return false;
    return true;
  };
  let rows = 0;
  const decks = ordered.map(({ cluster, share, tier }): Deck => {
    const span = SPANS[tier];
    let row = 0;
    let column = 0;
    search: for (; ; row++) {
      for (column = 0; column < columns; column++)
        if (free(column, row, span)) break search;
    }
    for (let c = column; c < column + span.columns; c++)
      for (let r = row; r < row + span.rows; r++) taken.add(`${c}:${r}`);
    rows = Math.max(rows, row + span.rows);
    return {
      id: cluster.key,
      key: cluster.key,
      cluster,
      tier,
      share,
      layers:
        cluster.refs.length >= 9 ? 2 : cluster.refs.length >= 5 ? 1 : 0,
      x: column * (DECK_CELL_WIDTH + DECK_GAP),
      y: DECK_TABLE_TOP + row * (DECK_CELL_HEIGHT + DECK_GAP),
      width: span.columns * DECK_CELL_WIDTH + (span.columns - 1) * DECK_GAP,
      height: span.rows * DECK_CELL_HEIGHT + (span.rows - 1) * DECK_GAP,
    };
  });
  return {
    decks,
    width: columns * DECK_CELL_WIDTH + (columns - 1) * DECK_GAP,
    height:
      DECK_TABLE_TOP +
      Math.max(rows, 1) * (DECK_CELL_HEIGHT + DECK_GAP) -
      DECK_GAP,
  };
}

type DeckSpan = (typeof SPANS)[DeckTier];

export const FAN_CARD_WIDTH = 440;
export const FAN_CARD_HEIGHT = 560;
const FAN_STEP = 410;
const FAN_ROW_STEP = 600;
export const FAN_MAX_CARDS = 7;

/** cards of an opened deck, kept on the table: they fan out from the deck and wrap when the table is narrow */
export function fanPositions(
  deck: Pick<Deck, "x" | "y">,
  count: number,
  tableWidth: number,
): Array<{ x: number; y: number; rotate: number }> {
  const perRow = Math.max(
    1,
    Math.floor((tableWidth - FAN_CARD_WIDTH) / FAN_STEP) + 1,
  );
  const inRow = Math.min(count, perRow);
  const span = FAN_CARD_WIDTH + (inRow - 1) * FAN_STEP;
  const left = Math.max(0, Math.min(deck.x, tableWidth - span));
  return Array.from({ length: count }, (_, index) => {
    const position = index % perRow;
    const middle = (inRow - 1) / 2;
    return {
      x: left + position * FAN_STEP,
      y:
        deck.y +
        Math.floor(index / perRow) * FAN_ROW_STEP +
        Math.abs(position - middle) * 10,
      rotate: (position - middle) * 1.2,
    };
  });
}
