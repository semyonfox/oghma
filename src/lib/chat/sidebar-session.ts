import { isValidUUID } from "@/lib/utils/uuid";

const STORAGE_KEY = "oghma:sidebar-chat-sessions";

type SidebarSessions = Record<string, string>;

function readSessions(storage: Pick<Storage, "getItem">): SidebarSessions {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as SidebarSessions)
      : {};
  } catch {
    return {};
  }
}

export function readSidebarChatSession(
  noteId: string,
  storage: Pick<Storage, "getItem"> = sessionStorage,
): string | undefined {
  const sessionId = readSessions(storage)[noteId];
  return typeof sessionId === "string" && isValidUUID(sessionId)
    ? sessionId
    : undefined;
}

export function rememberSidebarChatSession(
  noteId: string,
  sessionId: string,
  storage: Pick<Storage, "getItem" | "setItem"> = sessionStorage,
): void {
  if (!isValidUUID(noteId) || !isValidUUID(sessionId)) return;
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...readSessions(storage), [noteId]: sessionId }),
  );
}

export function forgetSidebarChatSession(
  sessionId: string,
  storage: Pick<Storage, "getItem" | "setItem"> = sessionStorage,
): void {
  const sessions = readSessions(storage);
  const remaining = Object.fromEntries(
    Object.entries(sessions).filter(([, storedId]) => storedId !== sessionId),
  );
  storage.setItem(STORAGE_KEY, JSON.stringify(remaining));
}
