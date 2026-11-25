import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ServerEvent } from "@/lib/server-events/types";

const USER_ID = "22222222-2222-2222-2222-222222222222";

const mocks = vi.hoisted(() => ({
  listener: null as ((event: ServerEvent) => void) | null,
  unsubscribe: vi.fn(),
  record: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
}));

vi.mock("@/lib/api-error", () => ({
  withErrorHandler: (handler: unknown) => handler,
  requireAuth: vi.fn().mockResolvedValue({ user_id: "22222222-2222-2222-2222-222222222222" }),
}));
vi.mock("@/lib/server-events/hub", () => ({
  subscribeServerEvents: vi.fn(async (_userId: string, listener: (event: ServerEvent) => void) => {
    mocks.listener = listener;
    return mocks.unsubscribe;
  }),
}));
vi.mock("@/lib/chat/presence", () => ({
  isValidPresenceTabId: (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(value),
  recordChatPresence: mocks.record,
  removeChatPresence: mocks.remove,
}));
vi.mock("@/lib/logger", () => ({ default: { warn: vi.fn() } }));

import { GET } from "@/app/api/events/route";

describe("GET /api/events", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("streams the user's events and holds the tab's chat presence while open", async () => {
    vi.useFakeTimers();
    const client = new AbortController();
    const response = await GET(new NextRequest("http://localhost/api/events?tab=tab-1", { signal: client.signal }));
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const read = async () => decoder.decode((await reader.read()).value);

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(await read()).toContain("retry: 5000");
    expect(mocks.record).toHaveBeenCalledWith(USER_ID, "tab-1");

    mocks.listener?.({ type: "tree", parentId: null });
    expect(await read()).toBe('event: tree\ndata: {"type":"tree","parentId":null}\n\n');

    // the ping refreshes presence without the tab sending anything
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await read()).toBe(": ping\n\n");
    expect(mocks.record).toHaveBeenCalledTimes(2);

    client.abort();
    expect(mocks.remove).toHaveBeenCalledWith(USER_ID, "tab-1");
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect((await reader.read()).done).toBe(true);
  });
});
