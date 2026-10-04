// local draft persistence — writes dirty content to IDB before cloud save
// so a crash/close never loses unsaved work

import { uiCache } from "./cache";

// owner A keeps the legacy key; owners follow their notes across pane swaps
const key = (noteId: string, owner: "A" | "B") =>
  owner === "A" ? `draft:${noteId}` : `draft:B:${noteId}`;

export interface NoteDraft {
  content: string;
  draftAt: number; // epoch ms — compare against note.updatedAt to decide winner
  version?: string;
}

export async function writeDraft(
  noteId: string,
  owner: "A" | "B",
  content: string,
): Promise<NoteDraft> {
  const draft = { content, draftAt: Date.now(), version: crypto.randomUUID() };
  await uiCache.setItem<NoteDraft>(key(noteId, owner), draft);
  return draft;
}

export async function readDraft(
  noteId: string,
  owner: "A" | "B",
  recoverOtherOwner?: () => boolean,
): Promise<NoteDraft | null> {
  if (recoverOtherOwner) {
    return (await uiCache.getOrMoveItem<NoteDraft>(
      key(noteId, owner),
      key(noteId, owner === "A" ? "B" : "A"),
      recoverOtherOwner,
    )) ?? null;
  }
  return (await uiCache.getItem<NoteDraft>(key(noteId, owner))) ?? null;
}

export async function clearDraft(
  noteId: string,
  owner: "A" | "B",
  savedDraft: NoteDraft,
): Promise<void> {
  // compare and delete in one IDB transaction so a later edit survives
  await uiCache.removeItemIf<NoteDraft>(key(noteId, owner), (current) =>
    savedDraft.version !== undefined && current?.version === savedDraft.version,
  );
}
