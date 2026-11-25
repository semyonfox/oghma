"use client";

import { SERVER_EVENT_TYPES, serverEventSchema, type ServerEvent } from "./types";

// one stream per tab, opened while anything listens. a refused stream (signed
// out, expired session, LISTEN down) is retried with backoff, and callers poll
// at their old pace until it is back
const RETRY_REFUSED_MS = 60_000;
const MAX_RETRY_REFUSED_MS = 15 * 60_000;
// a component remounting, or one view replacing another, keeps the same stream
const CLOSE_IDLE_MS = 2_000;
const TAB_ID_STORAGE_KEY = "oghma-tab-id";

type Listener = (event: ServerEvent) => void;

const listeners = new Set<Listener>();
let source: EventSource | null = null;
let connected = false;
let openedBefore = false;
let retryDelay = RETRY_REFUSED_MS;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

// the stream doubles as chat presence, so the server needs a stable id per
// tab that survives reloads but not a second tab
function tabId(): string | null {
  try {
    const existing = sessionStorage.getItem(TAB_ID_STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(TAB_ID_STORAGE_KEY, id);
    return id;
  } catch {
    // without sessionStorage the stream still delivers events, only presence is off
    return null;
  }
}

function emit(event: ServerEvent): void {
  for (const listener of listeners) listener(event);
}

function connect(): void {
  if (source || typeof EventSource === "undefined") return;
  clearTimeout(retryTimer);
  const id = tabId();
  const next = new EventSource(id ? `/api/events?tab=${encodeURIComponent(id)}` : "/api/events");
  source = next;
  next.onopen = () => {
    connected = true;
    retryDelay = RETRY_REFUSED_MS;
    // anything sent while this tab was away is lost, so catch up
    if (openedBefore) emit({ type: "resync" });
    openedBefore = true;
  };
  next.onerror = () => {
    // CONNECTING means the browser is already retrying a dropped stream
    if (next.readyState !== EventSource.CLOSED) {
      connected = false;
      return;
    }
    if (source === next) source = null;
    const wasConnected = connected;
    connected = false;
    // callers rely on events to move on, so tell them to fetch and fall back to their timers
    if (wasConnected) emit({ type: "resync" });
    retryTimer = setTimeout(() => {
      if (listeners.size > 0) connect();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_REFUSED_MS);
  };
  for (const type of SERVER_EVENT_TYPES) {
    next.addEventListener(type, (message) => {
      let json: unknown;
      try {
        json = JSON.parse(message.data);
      } catch {
        return;
      }
      const parsed = serverEventSchema.safeParse(json);
      if (parsed.success) emit(parsed.data);
    });
  }
}

/** True while events are arriving. Polls only run while this is false. */
export function serverEventsConnected(): boolean {
  return connected;
}

export function subscribeServerEvents(listener: Listener): () => void {
  listeners.add(listener);
  clearTimeout(closeTimer);
  connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (listeners.size > 0) return;
      clearTimeout(retryTimer);
      source?.close();
      source = null;
      connected = false;
    }, CLOSE_IDLE_MS);
  };
}
