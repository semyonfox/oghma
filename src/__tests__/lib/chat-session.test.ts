import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  return { default: sqlMock };
});

vi.mock("@/lib/utils/uuid", () => ({
  generateUUID: vi.fn().mockReturnValue("00000000-0000-0000-0000-000000000123"),
  isValidUUID: vi.fn((value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ),
  ),
}));

import sql from "@/database/pgsql.js";
import {
  createEmptyChatSessionContext,
  loadHistory,
  normalizeChatSessionContext,
  recordSessionAccesses,
  recordSessionCreatedNote,
  setSessionScope,
} from "@/lib/chat/session";

describe("chat session context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sql).mockResolvedValue([]);
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
    vi.mocked(sql)
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

    expect(vi.mocked(sql).mock.calls[1]).toContainEqual(
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
    vi.mocked(sql)
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

    expect(vi.mocked(sql).mock.calls[1]).toContainEqual(
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
    vi.mocked(sql)
      .mockResolvedValueOnce([{ context: {} }])
      .mockResolvedValueOnce([]);

    await recordSessionCreatedNote(
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      { id: "33333333-3333-3333-3333-333333333333", title: "Summary" },
      { id: "44444444-4444-4444-4444-444444444444", title: "CT213" },
    );

    expect(vi.mocked(sql).mock.calls[1]).toContainEqual(
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
});

describe("loadHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sql).mockResolvedValue([]);
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
});
