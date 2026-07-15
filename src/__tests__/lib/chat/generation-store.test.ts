import { beforeEach, describe, expect, it, vi } from "vitest";

const sqlMock = vi.hoisted(() => vi.fn());
const redisMock = vi.hoisted(() => ({
  call: vi.fn(),
  del: vi.fn(),
  expire: vi.fn(),
  xadd: vi.fn(),
}));

vi.mock("@/database/pgsql.js", () => ({ default: sqlMock }));
vi.mock("@/lib/redis", () => ({ redis: redisMock }));
vi.mock("@/lib/utils/uuid", () => ({
  generateUUID: () => "11111111-1111-1111-1111-111111111111",
}));

import {
  appendChatGenerationEvent,
  createChatGeneration,
  readChatGenerationEvents,
} from "@/lib/chat/generation-store";

describe("resumable chat generation store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlMock.mockResolvedValue([]);
    redisMock.expire.mockResolvedValue(1);
  });

  it("creates a durable generation record before enqueue", async () => {
    const id = await createChatGeneration({
      userId: "22222222-2222-2222-2222-222222222222",
      sessionId: "33333333-3333-3333-3333-333333333333",
      message: "Explain streams",
      scope: {
        sessionContext: {},
        scopedNoteIds: null,
        scopedInputNoteIds: [],
        history: [],
      },
      useRag: true,
      thinkingMode: "auto",
      requestOrigin: "https://oghmanotes.ie",
      respectPrivacySignal: false,
    });

    expect(id).toBe("11111111-1111-1111-1111-111111111111");
    expect(sqlMock).toHaveBeenCalledOnce();
    expect(sqlMock.mock.calls[0]).toContainEqual(
      expect.stringContaining("Explain streams"),
    );
  });

  it("stores bounded SSE events and refreshes their expiry", async () => {
    redisMock.xadd.mockResolvedValue("1720000000000-1");

    await expect(
      appendChatGenerationEvent(
        "11111111-1111-1111-1111-111111111111",
        'event: token\ndata: {"text":"hi"}\n\n',
      ),
    ).resolves.toBe("1720000000000-1");

    expect(redisMock.xadd).toHaveBeenCalledWith(
      "chat-generation:11111111-1111-1111-1111-111111111111:events",
      "MAXLEN",
      "~",
      4000,
      "*",
      "sse",
      expect.stringContaining("event: token"),
    );
    expect(redisMock.expire).toHaveBeenCalledWith(
      expect.stringContaining("chat-generation:"),
      3600,
    );
  });

  it("reads only events after the reconnect cursor", async () => {
    redisMock.call.mockResolvedValue([
      [
        "stream-key",
        [
          ["1720000000000-2", ["sse", 'event: token\ndata: {"text":"there"}\n\n']],
        ],
      ],
    ]);

    await expect(
      readChatGenerationEvents(
        "11111111-1111-1111-1111-111111111111",
        "1720000000000-1",
        500,
      ),
    ).resolves.toEqual([
      {
        id: "1720000000000-2",
        sse: 'event: token\ndata: {"text":"there"}\n\n',
      },
    ]);
    expect(redisMock.call).toHaveBeenCalledWith(
      "XREAD",
      "BLOCK",
      "500",
      "COUNT",
      "200",
      "STREAMS",
      expect.stringContaining("chat-generation:"),
      "1720000000000-1",
    );
  });
});
