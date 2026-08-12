import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = Object.assign(vi.fn(), {
    json: vi.fn((value: unknown) => value),
  });
  const sql = Object.assign(vi.fn(), {
    json: vi.fn((value: unknown) => value),
    begin: vi.fn(
      async (callback: (transaction: typeof tx) => unknown) => callback(tx),
    ),
  });
  return { sql, tx };
});

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));

vi.mock("@/lib/utils/uuid", () => ({
  generateUUID: vi.fn().mockReturnValue("00000000-0000-0000-0000-000000000123"),
  isValidUUID: vi.fn((value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ),
  ),
}));

import {
  createEmptyChatSessionContext,
  loadHistory,
  normalizeChatSessionContext,
  persistMessage,
  recordSessionAccesses,
  recordSessionCreatedNote,
  setSessionScope,
} from "@/lib/chat/session";

function queryText(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join(" ");
}

describe("chat generation ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.mockResolvedValue([]);
    mocks.tx.mockResolvedValue([]);
  });

  it("marks a session as generating when the user message is persisted", async () => {
    await persistMessage(
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "user",
      "Explain this",
    );

    const [messageInsert, sessionUpdate] = mocks.tx.mock.calls;
    expect(mocks.sql.begin).toHaveBeenCalledOnce();
    expect(queryText(messageInsert!)).toContain("INSERT INTO app.chat_messages");
    expect(queryText(sessionUpdate!)).toContain("UPDATE app.chat_sessions");
    expect(sessionUpdate).toContain("generating");
  });

  it("marks a session idle only after the assistant message is persisted", async () => {
    await persistMessage(
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "assistant",
      "Here is the answer",
    );

    const [messageInsert, sessionUpdate] = mocks.tx.mock.calls;
    expect(queryText(messageInsert!)).toContain("INSERT INTO app.chat_messages");
    expect(queryText(sessionUpdate!)).toContain("UPDATE app.chat_sessions");
    expect(sessionUpdate).toContain("idle");
    expect(mocks.tx.json).toHaveBeenNthCalledWith(1, [
      { type: "text", text: "Here is the answer" },
    ]);
    expect(mocks.tx.json).toHaveBeenNthCalledWith(2, {});
  });
});

describe("chat session context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.mockResolvedValue([]);
    mocks.tx.mockResolvedValue([]);
    mocks.sql.begin.mockImplementation(
      async (callback: (transaction: typeof mocks.tx) => unknown) =>
        callback(mocks.tx),
    );
  });

  it("normalizes malformed context payloads", () => {
    expect(normalizeChatSessionContext(null)).toEqual(
      createEmptyChatSessionContext(),
    );

    expect(
      normalizeChatSessionContext({
        scope: {
          notes: [
            {
              id: "11111111-1111-1111-1111-111111111111",
              title: " Lecture 1 ",
            },
            { id: "11111111-1111-1111-1111-111111111111", title: "Duplicate" },
            { id: "bad-id", title: "Ignored" },
          ],
          folders: [
            { id: "22222222-2222-2222-2222-222222222222", title: " CT213 " },
          ],
        },
        recentAccesses: [
          {
            id: "33333333-3333-3333-3333-333333333333",
            title: "OSI",
            kind: "read",
          },
          { id: "bad-id", title: "Ignore", kind: "read" },
          {
            id: "44444444-4444-4444-4444-444444444444",
            title: "No kind",
            kind: "unknown",
          },
        ],
        lastFolder: {
          id: "22222222-2222-2222-2222-222222222222",
          title: " CT213 ",
        },
      }),
    ).toEqual({
      scope: {
        notes: [
          { id: "11111111-1111-1111-1111-111111111111", title: "Lecture 1" },
        ],
        folders: [
          { id: "22222222-2222-2222-2222-222222222222", title: "CT213" },
        ],
      },
      recentAccesses: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          title: "OSI",
          kind: "read",
        },
      ],
      lastFolder: {
        id: "22222222-2222-2222-2222-222222222222",
        title: "CT213",
      },
    });
  });

  it("persists normalized scope into session context", async () => {
    mocks.tx
      .mockResolvedValueOnce([{ context: {} }])
      .mockResolvedValueOnce([]);

    await setSessionScope(
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      [
        { id: "11111111-1111-1111-1111-111111111111", title: "Lecture 1" },
        { id: "11111111-1111-1111-1111-111111111111", title: "Duplicate" },
      ],
      [{ id: "22222222-2222-2222-2222-222222222222", title: "CT213" }],
    );

    expect(mocks.sql.begin).toHaveBeenCalledOnce();
    expect(queryText(mocks.tx.mock.calls[0])).toContain("FOR UPDATE");
    expect(mocks.tx.mock.calls[1]).toContainEqual(
      JSON.stringify({
        scope: {
          notes: [
            { id: "11111111-1111-1111-1111-111111111111", title: "Lecture 1" },
          ],
          folders: [
            { id: "22222222-2222-2222-2222-222222222222", title: "CT213" },
          ],
        },
        recentAccesses: [],
        lastFolder: null,
      }),
    );
  });

  it("dedupes recent accesses and keeps newest first", async () => {
    mocks.tx
      .mockResolvedValueOnce([
        {
          context: {
            scope: { notes: [], folders: [] },
            recentAccesses: [
              {
                id: "11111111-1111-1111-1111-111111111111",
                title: "Lecture 1",
                kind: "read",
              },
            ],
            lastFolder: null,
          },
        },
      ])
      .mockResolvedValueOnce([]);

    await recordSessionAccesses("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", [
      {
        id: "11111111-1111-1111-1111-111111111111",
        title: "Lecture 1",
        kind: "read",
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        title: "Lecture 2",
        kind: "search-hit",
      },
    ]);

    expect(mocks.tx.mock.calls[1]).toContainEqual(
      JSON.stringify({
        scope: { notes: [], folders: [] },
        recentAccesses: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            title: "Lecture 1",
            kind: "read",
          },
          {
            id: "22222222-2222-2222-2222-222222222222",
            title: "Lecture 2",
            kind: "search-hit",
          },
        ],
        lastFolder: null,
      }),
    );
  });

  it("stores the last folder when creating a note", async () => {
    mocks.tx
      .mockResolvedValueOnce([{ context: {} }])
      .mockResolvedValueOnce([]);

    await recordSessionCreatedNote(
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      { id: "33333333-3333-3333-3333-333333333333", title: "Summary" },
      { id: "44444444-4444-4444-4444-444444444444", title: "CT213" },
    );

    expect(mocks.tx.mock.calls[1]).toContainEqual(
      JSON.stringify({
        scope: { notes: [], folders: [] },
        recentAccesses: [
          {
            id: "33333333-3333-3333-3333-333333333333",
            title: "Summary",
            kind: "created",
          },
        ],
        lastFolder: {
          id: "44444444-4444-4444-4444-444444444444",
          title: "CT213",
        },
      }),
    );
  });

  it("locks and merges context updates through the transaction boundary", async () => {
    mocks.tx
      .mockResolvedValueOnce([
        {
          context: {
            scope: { notes: [], folders: [] },
            recentAccesses: [],
            lastFolder: null,
          },
        },
      ])
      .mockResolvedValueOnce([]);

    await recordSessionAccesses("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", [
      {
        id: "55555555-5555-5555-5555-555555555555",
        title: "Concurrent-safe",
        kind: "read",
      },
    ]);

    expect(mocks.sql.begin).toHaveBeenCalledOnce();
    expect(queryText(mocks.tx.mock.calls[0])).toContain("FOR UPDATE");
    expect(mocks.tx.mock.calls[1]).toContainEqual(
      JSON.stringify({
        scope: { notes: [], folders: [] },
        recentAccesses: [
          {
            id: "55555555-5555-5555-5555-555555555555",
            title: "Concurrent-safe",
            kind: "read",
          },
        ],
        lastFolder: null,
      }),
    );
  });
});

describe("loadHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.mockResolvedValue([]);
    mocks.tx.mockResolvedValue([]);
  });

  it("keeps only the most recent 20 messages from request history", async () => {
    const history = Array.from({ length: 25 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `message ${index}`,
    }));

    const result = await loadHistory(
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      undefined,
      history,
    );

    expect(result).toHaveLength(20);
    expect(result[0]?.content).toBe("message 5");
    expect(result.at(-1)?.content).toBe("message 24");
  });

  it("selects the latest database window and restores chronological order", async () => {
    mocks.sql.mockResolvedValueOnce([
      { role: "user", content: "older" },
      { role: "assistant", content: "newer" },
    ]);

    const result = await loadHistory(
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      [],
    );

    const query = queryText(mocks.sql.mock.calls[0]!);
    expect(query).toContain("ORDER BY created_at DESC");
    expect(query).toContain("ORDER BY created_at ASC");
    expect(result.map((message) => message.content)).toEqual([
      "older",
      "newer",
    ]);
  });
});
