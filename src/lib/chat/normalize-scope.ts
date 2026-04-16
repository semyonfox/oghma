// scope normalization: resolves request params into a unified scope

import { isValidUUID } from "@/lib/utils/uuid";
import { normalizeUuidList, resolveScopedNoteIds } from "@/lib/chat/rag-pipeline";
import type { ChatSessionContextItem, ChatSessionContext } from "@/lib/chat/session";
import {
  loadSessionContext,
  setSessionScope,
  resolveSession,
  loadHistory,
  persistMessage,
  type ChatMessage,
} from "@/lib/chat/session";

export interface ScopeRequestParams {
  noteId?: string;
  noteTitle?: string;
  noteIds?: string[];
  folderIds?: string[];
  selectedNotes?: { id: string; title: string }[];
  selectedFolders?: { id: string; title: string }[];
}

export interface NormalizedScope {
  sessionId: string;
  sessionContext: ChatSessionContext;
  scopedNoteIds: string[] | null;
  scopedInputNoteIds: string[];
  scopedInputFolderIds: string[];
  history: ChatMessage[];
  effectiveScope: {
    notes: ChatSessionContextItem[];
    folders: ChatSessionContextItem[];
  };
}

function normalizeScopeItems(value: unknown): ChatSessionContextItem[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const items: ChatSessionContextItem[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as { id?: unknown; title?: unknown };
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!isValidUUID(id) || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      title:
        typeof item.title === "string" && item.title.trim()
          ? item.title.trim().slice(0, 200)
          : "Untitled",
    });
  }

  return items;
}

function hasExplicitScopeInBody(body: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(body, "noteId") ||
    Object.prototype.hasOwnProperty.call(body, "noteIds") ||
    Object.prototype.hasOwnProperty.call(body, "folderIds") ||
    Object.prototype.hasOwnProperty.call(body, "selectedNotes") ||
    Object.prototype.hasOwnProperty.call(body, "selectedFolders")
  );
}

export async function normalizeScope(
  userId: string,
  params: ScopeRequestParams,
  body: Record<string, unknown>,
  requestedSessionId: string | undefined,
  message: string,
  requestHistory: ChatMessage[],
): Promise<NormalizedScope> {
  const hasExplicitScope = hasExplicitScopeInBody(body);

  const explicitScopedNotes = normalizeScopeItems(params.selectedNotes);
  const explicitScopedFolders = normalizeScopeItems(params.selectedFolders);

  const validNoteId =
    params.noteId && isValidUUID(params.noteId) ? params.noteId : undefined;
  const dedupedNoteIds = normalizeUuidList(params.noteIds);

  if (
    validNoteId &&
    !explicitScopedNotes.some((item) => item.id === validNoteId)
  ) {
    explicitScopedNotes.push({
      id: validNoteId,
      title: params.noteTitle ?? "Untitled",
    });
  }
  for (const id of dedupedNoteIds) {
    if (!explicitScopedNotes.some((item) => item.id === id)) {
      explicitScopedNotes.push({
        id,
        title:
          id === validNoteId ? (params.noteTitle ?? "Untitled") : "Untitled",
      });
    }
  }
  for (const id of normalizeUuidList(params.folderIds)) {
    if (!explicitScopedFolders.some((item) => item.id === id)) {
      explicitScopedFolders.push({ id, title: "Folder" });
    }
  }

  const sessionNoteId =
    explicitScopedFolders.length === 0 && explicitScopedNotes.length === 1
      ? explicitScopedNotes[0].id
      : undefined;

  const sessionId = await resolveSession(
    userId,
    requestedSessionId,
    sessionNoteId,
    message,
  );

  const persistedSessionContext = await loadSessionContext(sessionId);
  const effectiveScope = hasExplicitScope
    ? { notes: explicitScopedNotes, folders: explicitScopedFolders }
    : persistedSessionContext.scope;

  const sessionContext = hasExplicitScope
    ? await setSessionScope(
        sessionId,
        effectiveScope.notes,
        effectiveScope.folders,
      )
    : persistedSessionContext;

  const scopedInputNoteIds = effectiveScope.notes.map((item) => item.id);
  const scopedInputFolderIds = effectiveScope.folders.map((item) => item.id);
  const scopedNoteIds = await resolveScopedNoteIds(
    userId,
    scopedInputNoteIds,
    scopedInputFolderIds,
  );

  const history = await loadHistory(
    sessionId,
    requestedSessionId,
    requestHistory,
  );
  await persistMessage(sessionId, "user", message);

  return {
    sessionId,
    sessionContext,
    scopedNoteIds,
    scopedInputNoteIds,
    scopedInputFolderIds,
    history,
    effectiveScope,
  };
}

export function buildSessionMemoryPrompt(context: ChatSessionContext): string {
  const lines: string[] = [];

  const scopeNotes = context.scope.notes.slice(0, 4);
  const scopeFolders = context.scope.folders.slice(0, 4);
  if (scopeNotes.length > 0 || scopeFolders.length > 0) {
    const parts: string[] = [];
    if (scopeNotes.length > 0) {
      parts.push(
        `notes: ${scopeNotes.map((note) => `"${note.title}" (id: ${note.id})`).join(", ")}`,
      );
    }
    if (scopeFolders.length > 0) {
      parts.push(
        `folders: ${scopeFolders.map((folder) => `"${folder.title}" (id: ${folder.id})`).join(", ")}`,
      );
    }
    lines.push(`Active session scope -> ${parts.join("; ")}`);
  }

  const recentAccesses = context.recentAccesses.slice(0, 6);
  if (recentAccesses.length > 0) {
    lines.push(
      `Recent notes touched -> ${recentAccesses
        .map((access) => `${access.kind}: "${access.title}"`)
        .join(", ")}`,
    );
  }

  if (context.lastFolder) {
    lines.push(
      `Last folder used for note creation -> "${context.lastFolder.title}" (id: ${context.lastFolder.id})`,
    );
  }

  return lines.length > 0 ? `SESSION MEMORY:\n${lines.join("\n")}` : "";
}
