// Per-user, per-tab presence for chat generation cancellation.
//
// Every open app tab heartbeats its own field inside one Redis hash per user.
// A tab-close beacon removes its field immediately; a crashed tab simply goes
// stale. The chat worker treats "no fresh field" as the user being gone —
// in-app navigation never touches this signal, so it can never cancel work.
import { redis } from "@/lib/redis";

/** Heartbeat cadence for visible tabs (hidden tabs are browser-throttled to ~60s). */
export const PRESENCE_HEARTBEAT_MS = 10_000;

/**
 * A tab field older than this no longer counts as presence. Must comfortably
 * exceed the ~60s timer throttling browsers apply to hidden tabs.
 */
export const PRESENCE_STALE_MS = 90_000;

/**
 * Continuous absence required before a disconnect aborts a generation.
 * A refresh re-announces the same tab within ~2-5s, well inside this window.
 */
export const DISCONNECT_GRACE_MS = 15_000;

/** Hash lifetime — long enough that an idle-but-open tab never loses its entry. */
const PRESENCE_TTL_SECONDS = 15 * 60;

const TAB_ID_RE = /^[a-zA-Z0-9-]{1,64}$/;

function presenceKey(userId: string): string {
  return `chat:presence:{${userId}}`;
}

export function isValidPresenceTabId(value: unknown): value is string {
  return typeof value === "string" && TAB_ID_RE.test(value);
}

export async function recordChatPresence(
  userId: string,
  tabId: string,
): Promise<void> {
  const key = presenceKey(userId);
  await redis.hset(key, tabId, Date.now());
  await redis.expire(key, PRESENCE_TTL_SECONDS);
}

export async function removeChatPresence(
  userId: string,
  tabId: string,
): Promise<void> {
  await redis.hdel(presenceKey(userId), tabId);
}

/** True when any tab heartbeated within PRESENCE_STALE_MS. */
export async function hasFreshChatPresence(
  userId: string,
  staleMs = PRESENCE_STALE_MS,
): Promise<boolean> {
  const entries = await redis.hgetall(presenceKey(userId));
  const cutoff = Date.now() - staleMs;
  return Object.values(entries ?? {}).some((value) => {
    const ts = Number.parseInt(String(value), 10);
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

export type AbortReason = "stopped" | "disconnected" | null;

export interface AbortDecisionInput {
  cancelRequested: boolean;
  present: boolean;
  /** user had presence at some point during this generation — guards pure API usage */
  sawPresence: boolean;
  /** ms timestamp when continuous absence began, or null while present */
  firstAbsentAt: number | null;
  now: number;
  graceMs?: number;
}

/**
 * Pure decision for the worker watchdog. An explicit cancel always wins;
 * absence only aborts after it has lasted a full grace window, and only for
 * users that were actually present during this generation.
 */
export function resolveAbortReason(input: AbortDecisionInput): AbortReason {
  if (input.cancelRequested) return "stopped";
  const graceMs = input.graceMs ?? DISCONNECT_GRACE_MS;
  if (
    !input.present &&
    input.sawPresence &&
    input.firstAbsentAt !== null &&
    input.now - input.firstAbsentAt >= graceMs
  ) {
    return "disconnected";
  }
  return null;
}
