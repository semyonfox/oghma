// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerEvent } from "@/lib/server-events/types";

const db = vi.hoisted(() => ({
  notify: null as ((payload: string) => void) | null,
  relisten: null as (() => void) | null,
}));

vi.mock("@/database/pgsql", () => ({
  default: {
    listen: vi.fn(async (_channel: string, notify: (payload: string) => void, onListen: () => void) => {
      db.notify = notify;
      db.relisten = onListen;
      onListen();
      return { state: {}, unlisten: async () => {} };
    }),
  },
}));
vi.mock("@/lib/logger", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));

import { subscribeServerEvents } from "@/lib/server-events/hub";
import { createPoller } from "@/lib/server-events/poller";

describe("server event hub", () => {
  it("delivers each user only their own changes, and resyncs after a reconnect", async () => {
    const alice: ServerEvent[] = [];
    const bob: ServerEvent[] = [];
    const stopAlice = await subscribeServerEvents("alice", (event) => alice.push(event));
    await subscribeServerEvents("bob", (event) => bob.push(event));

    db.notify?.(JSON.stringify({ t: "tree", u: "alice", p: null }));
    db.notify?.(JSON.stringify({ t: "study", u: "bob", m: "map-1" }));
    db.notify?.("not json");
    db.relisten?.();
    stopAlice();
    db.notify?.(JSON.stringify({ t: "jobs", u: "alice" }));

    expect(alice).toEqual([{ type: "tree", parentId: null }, { type: "resync" }]);
    expect(bob).toEqual([{ type: "study", mapId: "map-1" }, { type: "resync" }]);
  });
});

describe("createPoller", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never overlaps ticks and spaces nudges by the minimum gap", async () => {
    vi.useFakeTimers();
    const running: Array<() => void> = [];
    const tick = vi.fn(() => new Promise<number | null>((resolve) => {
      running.push(() => resolve(null));
    }));
    const finish = () => running.shift()?.();
    const poller = createPoller(tick, 1_000);

    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(1);

    // nudges during a running tick collapse into one follow-up
    poller.nudge();
    poller.nudge();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(tick).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(2);

    finish();
    await vi.advanceTimersByTimeAsync(0);
    poller.nudge();
    await vi.advanceTimersByTimeAsync(999);
    expect(tick).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(tick).toHaveBeenCalledTimes(3);
    poller.stop();
  });
});
