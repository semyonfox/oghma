// splits text into sentence-aligned chunks of ~500 characters for embedding
// no overlap — chunks split at sentence boundaries to preserve coherence

import { getRagChunkSize } from "@/lib/ai-config";

const HARD_LIMIT_MULTIPLIER = 2;
const CLAUSE_BOUNDARY_CHARACTERS = [".", ",", ";", ":"];

function splitAtBestBoundary(segment: string, chunkLimit: number): number {
  let splitAt = segment.lastIndexOf("\n");
  for (const delimiter of CLAUSE_BOUNDARY_CHARACTERS) {
    const candidate = segment.lastIndexOf(delimiter);
    if (candidate > splitAt) splitAt = candidate;
  }

  return splitAt > chunkLimit * 0.5 ? splitAt : chunkLimit;
}

function splitOversizedSegment(segment: string, chunkSize: number): string[] {
  const hardLimit = chunkSize * HARD_LIMIT_MULTIPLIER;
  const chunks: string[] = [];
  let remaining = segment.trim();

  while (remaining.length > hardLimit) {
    const window = remaining.slice(0, hardLimit);
    const splitAt = splitAtBestBoundary(window, chunkSize);
    const chunk = remaining.slice(0, splitAt + 1).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(splitAt + 1).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export const chunkText = (
  text: string,
  chunkSize = getRagChunkSize(),
): string[] => {
    // Handle empty or whitespace-only text
    if (!text || text.trim().length === 0) {
        return [];
    }

    const sentences = text.split(/(?<=[.?!])\s+/);
  const chunks: string[] = [];
  let current = "";

  const flushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
  };

  const append = (segment: string) => {
    const normalized = segment.trim();
    if (!normalized) return;

    if (!current.trim()) {
      current = normalized;
      return;
    }

    if ((current + " " + normalized).length > chunkSize) {
      flushCurrent();
      current = normalized;
      return;
    }

    current = `${current} ${normalized}`;
  };

  for (const sentence of sentences) {
    const safeSentence = sentence.trim();
    if (!safeSentence) continue;

    if (safeSentence.length > chunkSize) {
      flushCurrent();
      current = "";

      for (const chunk of splitOversizedSegment(safeSentence, chunkSize)) {
        append(chunk);
      }
      continue;
    }

    append(safeSentence);
  }

  flushCurrent();
  return chunks;
};
