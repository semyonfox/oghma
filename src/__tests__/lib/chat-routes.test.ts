import { describe, expect, it } from "vitest";

import { buildChatSessionHref, buildNewChatHref } from "@/lib/chat/routes";

describe("chat routes", () => {
  it("builds the base new-chat route when there is no scope", () => {
    expect(buildNewChatHref()).toBe("/chat");
  });

  it("preserves a single note scope for a new chat", () => {
    expect(
      buildNewChatHref({
        noteId: "note-1",
        noteTitle: "Lecture 1",
      }),
    ).toBe("/chat?noteId=note-1&noteTitle=Lecture+1");
  });

  it("prefers explicit selected items over fallback scope", () => {
    expect(
      buildNewChatHref({
        noteId: "fallback-note",
        noteTitle: "Fallback",
        selectedNotes: [
          { id: "note-1", title: "First note" },
          { id: "note-2", title: "Second note" },
        ],
        selectedFolders: [{ id: "folder-1", title: "Course folder" }],
      }),
    ).toBe(
      "/chat?noteId=note-1&noteTitle=First+note&noteId=note-2&noteTitle=Second+note&folderId=folder-1&folderTitle=Course+folder",
    );
  });

  it("builds persisted chat routes with the same scope query", () => {
    expect(
      buildChatSessionHref("01963b3a-7c50-7000-8000-000000000001", {
        folderId: "folder-1",
        folderTitle: "Revision",
      }),
    ).toBe(
      "/chat/01963b3a-7c50-7000-8000-000000000001?folderId=folder-1&folderTitle=Revision",
    );
  });
});
