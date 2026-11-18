"use client";

import { loadPdfBytes } from "@/components/editor/use-pdf-cache";
import {
  memoryPageUrl,
  pageCacheGeneration,
  storePage,
  storedPageUrl,
} from "@/lib/notes/pdf-cache/page-store";

// react-pdf bundles its own pdfjs-dist, the one /pdf.worker.js matches
type LoadingTask = ReturnType<
  (typeof import("react-pdf"))["pdfjs"]["getDocument"]
>;
interface OpenDocument {
  doc: LoadingTask["promise"];
  /** renders using this file right now, so eviction leaves it open */
  users: number;
  close: () => void;
}

// about twice a card's width, so cards stay sharp on high-dpi screens and each page stays small
const RENDER_WIDTH = 480;
// a board full of PDFs would otherwise parse every one of them at once
const MAX_RENDERS = 2;
// the reader asks for pages one after another, so keep the last few files parsed
const MAX_OPEN_DOCUMENTS = MAX_RENDERS + 1;

const pending = new Map<string, Promise<string>>();
const documents = new Map<string, OpenDocument>();
let active = 0;
const queue: Array<() => void> = [];

async function withRenderSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_RENDERS) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  active += 1;
  try {
    return await task();
  } finally {
    active -= 1;
    queue.shift()?.();
  }
}

function openDocument(noteId: string, version: string): OpenDocument {
  const key = `${noteId}:${version}`;
  const open = documents.get(key);
  if (open) {
    // most recently used goes last
    documents.delete(key);
    documents.set(key, open);
    return open;
  }
  let task: LoadingTask | null = null;
  let closed = false;
  const doc = (async () => {
    const [{ pdfjs }, bytes] = await Promise.all([
      import("react-pdf"),
      loadPdfBytes(undefined, noteId),
    ]);
    if ("error" in bytes) throw new Error(bytes.error);
    if (closed) throw new Error("document closed");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.js";
    task = pdfjs.getDocument({ data: bytes.value });
    return task.promise;
  })();
  const entry: OpenDocument = {
    doc,
    users: 0,
    close: () => {
      closed = true;
      void task?.destroy().catch(() => {});
    },
  };
  doc.catch(() => {
    if (documents.get(key) === entry) documents.delete(key);
    entry.close();
  });
  documents.set(key, entry);
  for (const [oldKey, old] of documents) {
    if (documents.size <= MAX_OPEN_DOCUMENTS) break;
    // a file still rendering stays open; the cap is soft
    if (old.users > 0 || old === entry) continue;
    documents.delete(oldKey);
    old.close();
  }
  return entry;
}

async function renderPage(
  noteId: string,
  version: string,
  pageNumber: number,
): Promise<Blob> {
  const entry = openDocument(noteId, version);
  entry.users += 1;
  try {
    const page = await (await entry.doc).getPage(pageNumber);
    try {
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: RENDER_WIDTH / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.85),
      );
      if (!blob) throw new Error("page image unavailable");
      return blob;
    } finally {
      page.cleanup();
    }
  } finally {
    entry.users -= 1;
  }
}

/**
 * An image of one PDF page, rendered once per file version and kept in
 * memory and IndexedDB, so cards scrolling back into view do not reload.
 */
export function pdfPageImage(
  noteId: string,
  version: string,
  pageNumber: number,
): Promise<string> {
  const key = `${noteId}:${version}:${pageNumber}:${RENDER_WIDTH}`;
  const remembered = memoryPageUrl(key);
  if (remembered) return Promise.resolve(remembered);
  // a load that outlives an account switch must not keep the old account's
  // page, and a request after the switch must not wait on it
  const generation = pageCacheGeneration();
  const pendingKey = `${generation}:${key}`;
  const inFlight = pending.get(pendingKey);
  if (inFlight) return inFlight;

  const loading = (async () => {
    const stored = await storedPageUrl(key, generation);
    if (stored) return stored;
    const blob = await withRenderSlot(() =>
      renderPage(noteId, version, pageNumber),
    );
    return storePage(key, blob, generation);
  })().finally(() => pending.delete(pendingKey));
  pending.set(pendingKey, loading);
  return loading;
}

/** the page already rendered in this tab, for a first paint without a loading state */
export function rememberedPdfPage(
  noteId: string,
  version: string,
  pageNumber: number,
): string | undefined {
  return memoryPageUrl(`${noteId}:${version}:${pageNumber}:${RENDER_WIDTH}`);
}
