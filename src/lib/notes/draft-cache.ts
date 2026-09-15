// local draft persistence — writes dirty content to IDB before cloud save
// so a crash/close never loses unsaved work

import { uiCache } from "./cache";

const key = (noteId: string) => `draft:${noteId}`;
const LEGACY_DRAFT_PREFIX = "legacy-unowned-draft:";
let generation = 0;
let writable = true;
const pendingWrites = new Set<Promise<void>>();

export interface NoteDraft {
  content: string;
  draftAt: number; // epoch ms — compare against note.updatedAt to decide winner
}

export async function writeDraft(noteId: string, content: string): Promise<void> {
  if (!writable) return;
  const write = uiCache.setItem<NoteDraft>(key(noteId), { content, draftAt: Date.now() });
  pendingWrites.add(write);
  try {
    await write;
  } finally {
    pendingWrites.delete(write);
  }
}

// Reset blocks new writers, then drains writes already opening an IDB connection.
// Leave their values intact until quarantine has copied any unowned drafts.
export async function waitForDraftWrites(): Promise<void> {
  await Promise.allSettled([...pendingWrites]);
}

export async function readDraft(noteId: string): Promise<NoteDraft | null> {
  if (!writable) return null;
  return (await uiCache.getItem<NoteDraft>(key(noteId))) ?? null;
}

export async function clearDraft(noteId: string): Promise<void> {
  await uiCache.removeItem(key(noteId));
}

export function beginDraftCacheReset(): number {
  generation += 1;
  writable = false;
  return generation;
}

export function finishDraftCacheReset(resetGeneration: number): void {
  if (generation === resetGeneration) writable = true;
}

export async function clearAllDrafts(): Promise<void> {
  const keys = await uiCache.keys();
  await Promise.all(
    keys
      .filter((cacheKey) => cacheKey.startsWith("draft:"))
      .map((cacheKey) => uiCache.removeItem(cacheKey)),
  );
}

export async function quarantineUnownedDrafts(): Promise<void> {
  const keys = await uiCache.keys();
  for (const cacheKey of keys) {
    if (!cacheKey.startsWith("draft:")) continue;

    const backupKey = `${LEGACY_DRAFT_PREFIX}${cacheKey.slice("draft:".length)}`;
    const existingBackup = await uiCache.getItem<unknown>(backupKey);
    if (existingBackup !== undefined) continue;

    const draft = await uiCache.getItem<unknown>(cacheKey);
    if (draft !== undefined) await uiCache.setItem(backupKey, draft);
  }
}
