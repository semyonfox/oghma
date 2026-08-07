type ChunkHit = {
  chunkId: string;
};

type ChunkRow = {
  chunk_id: string;
  note_id: string;
};

/**
 * Maps the first available chunk row for each note in vector-hit order.
 */
export function uniqueRowsInHitOrder<
  Hit extends ChunkHit,
  Row extends ChunkRow,
  Result,
>(
  hits: readonly Hit[],
  rows: readonly Row[],
  limit: number,
  mapResult: (hit: Hit, row: Row) => Result,
): Result[] {
  const rowsByChunkId = new Map<string, Row>(
    rows.map((row) => [row.chunk_id, row]),
  );
  const seenNoteIds = new Set<string>();
  const results: Result[] = [];

  for (const hit of hits) {
    const row = rowsByChunkId.get(hit.chunkId);
    if (!row || seenNoteIds.has(row.note_id)) continue;

    seenNoteIds.add(row.note_id);
    results.push(mapResult(hit, row));
  }

  return results.slice(0, limit);
}
