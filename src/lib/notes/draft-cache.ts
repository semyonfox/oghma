// local draft persistence — writes dirty content to IDB before cloud save
// so a crash/close never loses unsaved work

import { uiCache } from "./cache";

const key = (noteId: string) => `draft:${noteId}`;

export interface NoteDraft {
  content: string;
  draftAt: number; // epoch ms — compare against note.updatedAt to decide winner
}

export async function writeDraft(noteId: string, content: string): Promise<void> {
  await uiCache.setItem<NoteDraft>(key(noteId), { content, draftAt: Date.now() });
}

export async function readDraft(noteId: string): Promise<NoteDraft | null> {
  return (await uiCache.getItem<NoteDraft>(key(noteId))) ?? null;
}

export async function clearDraft(noteId: string): Promise<void> {
  await uiCache.removeItem(key(noteId));
}
