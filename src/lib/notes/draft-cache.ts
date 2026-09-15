// local draft persistence — writes dirty content to IDB before cloud save
// so a crash/close never loses unsaved work

import { uiCache } from "./cache";

const key = (noteId: string) => `draft:${noteId}`;
let generation = 0;
let writable = true;

export interface NoteDraft {
  content: string;
  draftAt: number; // epoch ms — compare against note.updatedAt to decide winner
}

export async function writeDraft(noteId: string, content: string): Promise<void> {
  if (!writable) return;
  const writeGeneration = generation;
  await uiCache.setItem<NoteDraft>(key(noteId), { content, draftAt: Date.now() });
  if (!writable || generation !== writeGeneration) {
    await uiCache.removeItem(key(noteId));
  }
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
