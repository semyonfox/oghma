// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { normalizeApiResults } from "@/components/search/global-search-modal";

describe("global search response normalization", () => {
  it("keeps valid results in their declared section and drops malformed entries", () => {
    const results = normalizeApiResults({
      notes: [
        {
          id: "note-1",
          type: "note",
          title: "Typed note",
          href: "/notes/note-1",
          source: "keyword",
        },
        {
          id: "chat-in-note-section",
          type: "chat",
          title: "Wrong section",
          href: "/chat/chat-in-note-section",
          source: "keyword",
        },
      ],
      chats: [{ id: "missing-fields", type: "chat" }],
      quizzes: "not-an-array",
    });

    expect(results.notes).toEqual([
      {
        id: "note-1",
        type: "note",
        title: "Typed note",
        href: "/notes/note-1",
        source: "keyword",
      },
    ]);
    expect(results.chats).toEqual([]);
    expect(results.quizzes).toEqual([]);
  });
});
