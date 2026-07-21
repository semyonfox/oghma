import { describe, expect, it } from "vitest";
import {
  forgetSidebarChatSession,
  readSidebarChatSession,
  rememberSidebarChatSession,
} from "@/lib/chat/sidebar-session";

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}

describe("sidebar chat session continuity", () => {
  const noteId = "11111111-1111-1111-1111-111111111111";
  const sessionId = "22222222-2222-2222-2222-222222222222";

  it("remembers the chat session for each note", () => {
    const storage = memoryStorage();
    rememberSidebarChatSession(noteId, sessionId, storage);
    expect(readSidebarChatSession(noteId, storage)).toBe(sessionId);
  });

  it("ignores malformed or invalid stored session ids", () => {
    expect(readSidebarChatSession(noteId, memoryStorage("not-json"))).toBeUndefined();
    expect(
      readSidebarChatSession(
        noteId,
        memoryStorage(JSON.stringify({ [noteId]: "not-a-uuid" })),
      ),
    ).toBeUndefined();
  });

  it("forgets a sidebar mapping when its full chat is deleted", () => {
    const storage = memoryStorage();
    rememberSidebarChatSession(noteId, sessionId, storage);
    forgetSidebarChatSession(sessionId, storage);
    expect(readSidebarChatSession(noteId, storage)).toBeUndefined();
  });
});
