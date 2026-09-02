import { beforeEach, describe, expect, it, vi } from "vitest";

const sqlMock = vi.hoisted(() => vi.fn());
const redisMock = vi.hoisted(() => ({
  call: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  expire: vi.fn(),
  set: vi.fn(),
  xadd: vi.fn(),
}));

vi.mock("@/database/pgsql", () => ({ default: sqlMock }));
vi.mock("@/lib/redis", () => ({ redis: redisMock }));
vi.mock("@/lib/utils/uuid", () => ({
  generateUUID: () => "11111111-1111-1111-1111-111111111111",
}));

import {
  appendChatGenerationEvent,
  cancelChatGeneration,
  claimChatGeneration,
  createChatGeneration,
  failChatGeneration,
  finalizeChatGeneration,
  heartbeatChatGeneration,
  isChatGenerationCancelRequested,
  loadChatGeneration,
  loadOwnedChatGeneration,
  readChatGenerationEvents,
  recoverStaleChatGenerations,
  requeueChatGeneration,
  requestChatGenerationCancel,
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
        sessionContext: {
          scope: { notes: [], folders: [] },
          recentAccesses: [],
          lastFolder: null,
        },
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
    const query = (sqlMock.mock.calls[0]?.[0] as readonly string[]).join("?");
    expect(query).toContain("WITH user_message AS");
    expect(query).toContain("INSERT INTO app.chat_generations");
    expect(query).toContain("generation_status = 'generating'");
    expect(sqlMock.mock.calls[0]?.slice(1)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"message":"Explain streams"'),
      ]),
    );
  });

  it("loads payloads written as JSON strings by the original background stream", async () => {
    const payload = {
      userId: "22222222-2222-2222-2222-222222222222",
      sessionId: "33333333-3333-3333-3333-333333333333",
      message: "Explain streams",
      scope: {
        sessionContext: {
          scope: { notes: [], folders: [] },
          recentAccesses: [],
          lastFolder: null,
        },
        scopedNoteIds: null,
        scopedInputNoteIds: [],
        history: [],
      },
      useRag: true,
      thinkingMode: "auto",
      requestOrigin: "https://oghmanotes.ie",
      respectPrivacySignal: false,
    };
    sqlMock.mockResolvedValueOnce([
      {
        id: "11111111-1111-1111-1111-111111111111",
        session_id: payload.sessionId,
        user_id: payload.userId,
        status: "failed",
        request_payload: JSON.stringify(payload),
        error_message: "old failure",
      },
    ]);

    await expect(loadChatGeneration("11111111-1111-1111-1111-111111111111"))
      .resolves.toEqual(expect.objectContaining({ request_payload: payload }));
  });

  it("keeps payloads already decoded by postgres unchanged", async () => {
    const payload = { message: "Already decoded" } as never;
    const row = {
      id: "11111111-1111-1111-1111-111111111111",
      session_id: "33333333-3333-3333-3333-333333333333",
      user_id: "22222222-2222-2222-2222-222222222222",
      status: "running",
      request_payload: payload,
      error_message: null,
    };
    sqlMock.mockResolvedValueOnce([row]);

    await expect(
      loadOwnedChatGeneration(row.id, row.user_id),
    ).resolves.toEqual(row);
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
      "stream-key",
      [
        ["1720000000000-2", ["sse", 'event: token\ndata: {"text":"there"}\n\n']],
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

  it("also accepts an untransformed Redis stream reply", async () => {
    redisMock.call.mockResolvedValue([
      [
        "stream-key",
        [
          ["1720000000000-2", ["sse", 'event: done\ndata: {}\n\n']],
        ],
      ],
    ]);

    await expect(
      readChatGenerationEvents(
        "11111111-1111-1111-1111-111111111111",
        "1720000000000-1",
      ),
    ).resolves.toEqual([
      { id: "1720000000000-2", sse: "event: done\ndata: {}\n\n" },
    ]);
  });

  it("records and reads back a cancel request flag", async () => {
    redisMock.set.mockResolvedValue("OK");
    await requestChatGenerationCancel("11111111-1111-1111-1111-111111111111");
    expect(redisMock.set).toHaveBeenCalledWith(
      "chat-generation:11111111-1111-1111-1111-111111111111:cancel",
      "1",
      "EX",
      3600,
    );

    redisMock.exists.mockResolvedValueOnce(1);
    await expect(
      isChatGenerationCancelRequested("11111111-1111-1111-1111-111111111111"),
    ).resolves.toBe(true);

    redisMock.exists.mockResolvedValueOnce(0);
    await expect(
      isChatGenerationCancelRequested("11111111-1111-1111-1111-111111111111"),
    ).resolves.toBe(false);
  });

  it("claims queued work atomically and never reclaims an active worker", async () => {
    sqlMock.mockResolvedValueOnce([{
      id: "11111111-1111-1111-1111-111111111111",
      session_id: "33333333-3333-3333-3333-333333333333",
      user_id: "22222222-2222-2222-2222-222222222222",
      status: "generating",
      request_payload: { message: "hello" },
      error_message: null,
      lease_token: "11111111-1111-1111-1111-111111111111",
      lease_expires_at: new Date(),
    }]);

    await expect(
      claimChatGeneration("11111111-1111-1111-1111-111111111111"),
    ).resolves.toEqual(expect.objectContaining({
      leaseToken: "11111111-1111-1111-1111-111111111111",
      generation: expect.objectContaining({ status: "generating" }),
    }));

    const [query] = sqlMock.mock.calls[0] as [readonly string[]];
    const text = query.join("?");
    expect(text).toContain("WITH claimed AS");
    expect(text).toContain("status = 'queued'");
    expect(text).not.toContain("status IN ('queued', 'failed')");
    expect(text).toContain("lease_expires_at <= NOW()");
    expect(text).toContain("lease_token =");

    sqlMock.mockResolvedValueOnce([]);
    await expect(
      claimChatGeneration("11111111-1111-1111-1111-111111111111"),
    ).resolves.toBeNull();
  });

  it("renews only a live lease owned by the caller", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "11111111-1111-1111-1111-111111111111" }]);

    await expect(
      heartbeatChatGeneration(
        "11111111-1111-1111-1111-111111111111",
        "44444444-4444-4444-4444-444444444444",
      ),
    ).resolves.toBe(true);

    const [query] = sqlMock.mock.calls[0] as [readonly string[]];
    const text = query.join("?");
    expect(text).toContain("lease_token =");
    expect(text).toContain("lease_expires_at > NOW()");
    expect(text).toContain("heartbeat_at = NOW()");
  });

  it("cancels the generation and returns the session to idle atomically", async () => {
    await cancelChatGeneration("11111111-1111-1111-1111-111111111111");

    expect(sqlMock).toHaveBeenCalledOnce();
    const [query] = sqlMock.mock.calls[0] as [readonly string[]];
    expect(query.join("?")).toContain("status = 'cancelled'");
    expect(query.join("?")).toContain("ELSE 'idle'");
    expect(query.join("?")).toContain("active.status IN ('queued', 'generating')");
    expect(query.join("?")).toContain("active.id <>");
  });

  it("persists one assistant message and completes its generation atomically", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "33333333-3333-3333-3333-333333333333" }]);
    await expect(finalizeChatGeneration(
      "11111111-1111-1111-1111-111111111111",
      "44444444-4444-4444-4444-444444444444",
      "completed",
      {
        content: "Durable answer",
        parts: [{ type: "text", text: "Durable answer" }],
        metadata: { partial: false },
      },
    )).resolves.toBe(true);

    expect(sqlMock).toHaveBeenCalledOnce();
    const [query] = sqlMock.mock.calls[0] as [readonly string[]];
    const text = query.join("?");
    expect(text).toContain("WITH owned AS MATERIALIZED");
    expect(text).toContain("INSERT INTO app.chat_messages");
    expect(text).toContain("generation_id");
    expect(text).toContain("ON CONFLICT (generation_id) DO NOTHING");
    expect(text).toContain("lease_token =");
    expect(text).toContain("UPDATE app.chat_sessions");
    expect(text).toContain("active.status IN ('queued', 'generating')");
    expect(text).toContain("active.id <>");
    expect(sqlMock.mock.calls[0]?.slice(1)).toContain("Durable answer");
  });

  it("reports a lost lease without inserting or completing", async () => {
    sqlMock.mockResolvedValueOnce([]);
    await expect(finalizeChatGeneration(
      "11111111-1111-1111-1111-111111111111",
      "44444444-4444-4444-4444-444444444444",
      "completed",
      { content: "stale", parts: [] },
    )).resolves.toBe(false);
  });

  it("does not revive a cancelled generation during retry or failure handling", async () => {
    await requeueChatGeneration(
      "11111111-1111-1111-1111-111111111111",
      "provider error",
      "44444444-4444-4444-4444-444444444444",
    );
    await failChatGeneration(
      "11111111-1111-1111-1111-111111111111",
      "provider error",
    );

    const requeueQuery = (sqlMock.mock.calls[0]?.[0] as readonly string[]).join(
      "?",
    );
    const failureQuery = (sqlMock.mock.calls[1]?.[0] as readonly string[]).join(
      "?",
    );
    expect(requeueQuery).toContain("status = 'generating'");
    expect(requeueQuery).toContain("lease_token =");
    expect(failureQuery).toContain("status = 'queued'");
    expect(failureQuery).not.toContain("status <> 'completed'");
  });

  it("releases expired and abandoned queued rows for bounded recovery", async () => {
    sqlMock.mockResolvedValueOnce([
      { id: "11111111-1111-1111-1111-111111111111" },
      { id: "22222222-2222-2222-2222-222222222222" },
    ]);

    await expect(recoverStaleChatGenerations(25)).resolves.toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);

    const [query] = sqlMock.mock.calls[0] as [readonly string[]];
    const text = query.join("?");
    expect(text).toContain("lease_expires_at <= NOW()");
    expect(text).toContain("FOR UPDATE SKIP LOCKED");
    expect(text).toContain("SET status = 'queued'");
  });
});
