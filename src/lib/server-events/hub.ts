// one LISTEN connection per process, fanned out to the open /api/events
// streams by user. the payloads come from the triggers in
// database/migrations/093_server_events.sql
import { z } from "zod";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import type { ServerEvent } from "./types";

const CHANNEL = "oghma_events";

const payloadSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("tree"), u: z.string(), p: z.string().nullable() }),
  z.object({ t: z.literal("study"), u: z.string(), m: z.string() }),
  z.object({ t: z.literal("jobs"), u: z.string() }),
]);

type Listener = (event: ServerEvent) => void;

const listeners = new Map<string, Set<Listener>>();
let listening: Promise<void> | null = null;
let listenedBefore = false;

function toEvent(payload: z.infer<typeof payloadSchema>): ServerEvent {
  if (payload.t === "tree") return { type: "tree", parentId: payload.p };
  if (payload.t === "study") return { type: "study", mapId: payload.m };
  return { type: "jobs" };
}

function dispatch(raw: string): void {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    logger.warn("server event payload is not JSON");
    return;
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    logger.warn("server event payload has an unknown shape");
    return;
  }
  const event = toEvent(parsed.data);
  for (const listener of listeners.get(parsed.data.u) ?? []) listener(event);
}

// postgres.js reconnects the LISTEN connection on its own and calls onlisten
// each time. anything sent while it was down is gone, so every tab refetches
function onListen(): void {
  if (listenedBefore) {
    for (const group of listeners.values()) {
      for (const listener of group) listener({ type: "resync" });
    }
  }
  listenedBefore = true;
}

function ensureListening(): Promise<void> {
  listening ??= sql.listen(CHANNEL, dispatch, onListen).then(
    () => undefined,
    (error: unknown) => {
      // the next stream retries from scratch
      listening = null;
      throw error;
    },
  );
  return listening;
}

/** Deliver this user's events to listener until the returned function is called. */
export async function subscribeServerEvents(userId: string, listener: Listener): Promise<() => void> {
  await ensureListening();
  let group = listeners.get(userId);
  if (!group) {
    group = new Set();
    listeners.set(userId, group);
  }
  group.add(listener);
  return () => {
    const current = listeners.get(userId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(userId);
  };
}
