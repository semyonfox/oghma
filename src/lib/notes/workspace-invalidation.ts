"use client";

export type WorkspaceInvalidationScope = "tree" | "vault" | "session";

export interface WorkspaceInvalidation {
  version: 1;
  userId: string;
  scope: WorkspaceInvalidationScope;
  revision: number;
  sourceId: string;
}

const CHANNEL_NAME = "oghma-notes-workspace-v1";
const STORAGE_PREFIX = "oghmaNotes-workspace-invalidation:";
let localRevision = 0;
let tabSourceId: string | null = null;
const documentStartRevision = Date.now() * 1000;

function storageKey(
  userId: string,
  scope: WorkspaceInvalidationScope,
): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(userId)}:${scope}`;
}

function sourceId(): string {
  if (typeof window === "undefined") return "server";
  if (tabSourceId) return tabSourceId;

  tabSourceId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  return tabSourceId;
}

function invalidationKey(event: WorkspaceInvalidation): string {
  return `${event.sourceId}:${event.revision}`;
}

function parseInvalidation(value: unknown): WorkspaceInvalidation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Partial<WorkspaceInvalidation>;
  if (
    event.version !== 1 ||
    typeof event.userId !== "string" ||
    !event.userId ||
    (event.scope !== "tree" &&
      event.scope !== "vault" &&
      event.scope !== "session") ||
    typeof event.revision !== "number" ||
    !Number.isFinite(event.revision) ||
    typeof event.sourceId !== "string"
  ) {
    return null;
  }
  return event as WorkspaceInvalidation;
}

function parseStoredInvalidation(value: string | null): WorkspaceInvalidation | null {
  if (!value) return null;
  try {
    return parseInvalidation(JSON.parse(value));
  } catch {
    return null;
  }
}

export function publishWorkspaceInvalidation(
  userId: string,
  scope: WorkspaceInvalidationScope,
): void {
  if (typeof window === "undefined" || !userId) return;

  const event: WorkspaceInvalidation = {
    version: 1,
    userId,
    scope,
    revision: Date.now() * 1000 + (localRevision++ % 1000),
    sourceId: sourceId(),
  };
  const serialized = JSON.stringify(event);

  try {
    window.localStorage.setItem(storageKey(userId, scope), serialized);
  } catch {
    // BroadcastChannel still coordinates tabs when storage is unavailable.
  }

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(event);
    channel.close();
  }
}

export function subscribeToWorkspaceInvalidations(
  userId: string,
  listener: (event: WorkspaceInvalidation) => void,
): () => void {
  if (typeof window === "undefined" || !userId) return () => {};

  const lastEventByScope = new Map<WorkspaceInvalidationScope, string>();
  const deliver = (value: unknown) => {
    const event = parseInvalidation(value);
    if (!event || event.userId !== userId || event.sourceId === sourceId()) return;

    const eventKey = invalidationKey(event);
    if (eventKey === lastEventByScope.get(event.scope)) return;
    lastEventByScope.set(event.scope, eventKey);
    listener(event);
  };

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key !== storageKey(userId, "tree") &&
      event.key !== storageKey(userId, "vault") &&
      event.key !== storageKey(userId, "session")
    ) {
      return;
    }
    deliver(parseStoredInvalidation(event.newValue));
  };
  const handleFocus = () => {
    try {
      for (const scope of ["tree", "vault", "session"] as const) {
        deliver(
          parseStoredInvalidation(
            window.localStorage.getItem(storageKey(userId, scope)),
          ),
        );
      }
    } catch {
      // A live BroadcastChannel remains available in browsers blocking storage.
    }
  };

  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(CHANNEL_NAME)
      : null;
  if (channel) channel.onmessage = (event) => deliver(event.data);
  window.addEventListener("storage", handleStorage);
  window.addEventListener("focus", handleFocus);

  try {
    for (const scope of ["tree", "vault", "session"] as const) {
      const current = parseStoredInvalidation(
        window.localStorage.getItem(storageKey(userId, scope)),
      );
      if (!current) continue;
      if (current.revision <= documentStartRevision) {
        lastEventByScope.set(scope, invalidationKey(current));
      } else {
        deliver(current);
      }
    }
  } catch {
    // No baseline or focus catch-up is available when storage is blocked.
  }

  return () => {
    channel?.close();
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("focus", handleFocus);
  };
}
