import { beforeEach, describe, expect, it, vi } from "vitest";

const redisMock = vi.hoisted(() => ({
  hset: vi.fn(),
  hdel: vi.fn(),
  hgetall: vi.fn(),
  hlen: vi.fn(),
  expire: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({ redis: redisMock }));

import {
  DISCONNECT_GRACE_MS,
  PRESENCE_STALE_MS,
  hasFreshChatPresence,
  isValidPresenceTabId,
  recordChatPresence,
  removeChatPresence,
  resolveAbortReason,
} from "@/lib/chat/presence";

const USER = "22222222-2222-2222-2222-222222222222";
const TAB = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("chat presence store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.hset.mockResolvedValue(1);
    redisMock.hdel.mockResolvedValue(1);
    redisMock.hlen.mockResolvedValue(1);
    redisMock.expire.mockResolvedValue(1);
    redisMock.hgetall.mockResolvedValue({});
  });

  it("records a tab heartbeat under the user's presence hash", async () => {
    await recordChatPresence(USER, TAB);

    expect(redisMock.hset).toHaveBeenCalledWith(
      `chat:presence:{${USER}}`,
      TAB,
      expect.any(Number),
    );
    expect(redisMock.expire).toHaveBeenCalledWith(
      `chat:presence:{${USER}}`,
      15 * 60,
    );
    // small hash: the prune read must not run — heartbeats stay cheap
    expect(redisMock.hgetall).not.toHaveBeenCalled();
  });

  it("prunes dead tab fields once the hash grows past the threshold", async () => {
    const now = Date.now();
    redisMock.hlen.mockResolvedValue(9);
    redisMock.hgetall.mockResolvedValue({
      [TAB]: String(now),
      "fresh-tab": String(now - 5_000),
      "dead-tab-1": String(now - PRESENCE_STALE_MS - 1_000),
      "dead-tab-2": "not-a-timestamp",
    });

    await recordChatPresence(USER, TAB);

    expect(redisMock.hdel).toHaveBeenCalledWith(
      `chat:presence:{${USER}}`,
      "dead-tab-1",
      "dead-tab-2",
    );
  });

  it("never prunes the tab that just heartbeated", async () => {
    redisMock.hlen.mockResolvedValue(9);
    redisMock.hgetall.mockResolvedValue({
      [TAB]: "not-a-timestamp-yet-still-current",
    });

    await recordChatPresence(USER, TAB);

    expect(redisMock.hdel).not.toHaveBeenCalled();
  });

  it("treats prune failures as harmless", async () => {
    redisMock.hlen.mockRejectedValue(new Error("redis down"));

    await expect(recordChatPresence(USER, TAB)).resolves.toBeUndefined();
  });

  it("removes only the disconnecting tab's field", async () => {
    await removeChatPresence(USER, TAB);

    expect(redisMock.hdel).toHaveBeenCalledWith(
      `chat:presence:{${USER}}`,
      TAB,
    );
  });

  it("treats a recent heartbeat from any tab as presence", async () => {
    redisMock.hgetall.mockResolvedValue({
      [TAB]: String(Date.now() - PRESENCE_STALE_MS + 5_000),
      "stale-tab": String(Date.now() - PRESENCE_STALE_MS - 60_000),
    });

    await expect(hasFreshChatPresence(USER)).resolves.toBe(true);
  });

  it("ignores stale, malformed, and missing entries", async () => {
    redisMock.hgetall.mockResolvedValue({
      "old-tab": String(Date.now() - PRESENCE_STALE_MS - 1_000),
      "bad-tab": "not-a-timestamp",
    });
    await expect(hasFreshChatPresence(USER)).resolves.toBe(false);

    redisMock.hgetall.mockResolvedValue({});
    await expect(hasFreshChatPresence(USER)).resolves.toBe(false);
  });
});

describe("isValidPresenceTabId", () => {
  it("accepts uuid-shaped ids and rejects anything unusual", () => {
    expect(isValidPresenceTabId(TAB)).toBe(true);
    expect(isValidPresenceTabId("short-id")).toBe(true);
    expect(isValidPresenceTabId("")).toBe(false);
    expect(isValidPresenceTabId(null)).toBe(false);
    expect(isValidPresenceTabId(42)).toBe(false);
    expect(isValidPresenceTabId("a".repeat(65))).toBe(false);
    expect(isValidPresenceTabId("bad*chars")).toBe(false);
  });
});

describe("resolveAbortReason", () => {
  const now = 1_800_000_000_000;
  const base = {
    cancelRequested: false,
    present: true,
    sawPresence: true,
    firstAbsentAt: null,
    now,
  };

  it("always honours an explicit cancel", () => {
    expect(resolveAbortReason({ ...base, cancelRequested: true })).toBe(
      "stopped",
    );
    expect(
      resolveAbortReason({
        ...base,
        cancelRequested: true,
        present: false,
        sawPresence: false,
      }),
    ).toBe("stopped");
  });

  it("never aborts while the user is present", () => {
    expect(resolveAbortReason(base)).toBeNull();
  });

  it("aborts only after a full grace window of continuous absence", () => {
    const absent = { ...base, present: false };
    expect(
      resolveAbortReason({
        ...absent,
        firstAbsentAt: now - DISCONNECT_GRACE_MS + 1_000,
      }),
    ).toBeNull();
    expect(
      resolveAbortReason({
        ...absent,
        firstAbsentAt: now - DISCONNECT_GRACE_MS,
      }),
    ).toBe("disconnected");
  });

  it("never disconnect-aborts a user that was never present (API usage)", () => {
    expect(
      resolveAbortReason({
        ...base,
        present: false,
        sawPresence: false,
        firstAbsentAt: now - DISCONNECT_GRACE_MS * 10,
      }),
    ).toBeNull();
  });

  it("requires an absence start before the grace window can elapse", () => {
    expect(
      resolveAbortReason({ ...base, present: false, firstAbsentAt: null }),
    ).toBeNull();
  });
});
