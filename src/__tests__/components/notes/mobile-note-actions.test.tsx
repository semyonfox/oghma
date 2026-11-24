// @vitest-environment jsdom

import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadChildren: vi.fn(),
  moveItem: vi.fn(),
  mutateNote: vi.fn(),
  tree: {
    items: {
      root: {
        id: "root",
        children: ["folder-a", "folder-b", "note-a"],
        childrenLoaded: true,
        isFolder: true,
      },
      "folder-a": {
        id: "folder-a",
        children: ["folder-child"],
        childrenLoaded: true,
        isFolder: true,
        data: { id: "folder-a", title: "Folder A", pid: undefined, pinned: 0 },
      },
      "folder-child": {
        id: "folder-child",
        children: [],
        childrenLoaded: true,
        isFolder: true,
        data: {
          id: "folder-child",
          title: "Folder child",
          pid: "folder-a",
          pinned: 0,
        },
      },
      "folder-b": {
        id: "folder-b",
        children: [],
        childrenLoaded: true,
        isFolder: true,
        data: { id: "folder-b", title: "Folder B", pid: undefined, pinned: 0 },
      },
      "note-a": {
        id: "note-a",
        children: [],
        childrenLoaded: true,
        isFolder: false,
        data: { id: "note-a", title: "Draft", pid: undefined, pinned: 0 },
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/notes/note-a",
}));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  __esModule: true,
  default: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/notes/state/tree", () => {
  const state = {
    get tree() {
      return mocks.tree;
    },
    loadChildren: mocks.loadChildren,
    loadingChildren: new Set<string>(),
    getState: undefined,
  };
  const store = (selector: (value: typeof state) => unknown) => selector(state);
  store.getState = () => ({
    ...state,
    moveItem: mocks.moveItem,
    genNewId: () => "copy-id",
  });
  return { __esModule: true, default: store };
});
vi.mock("@/lib/notes/state/note", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      mutateNote: mocks.mutateNote,
    }),
  },
}));
vi.mock("@/components/notes/sidebar/use-sidebar-actions", () => ({
  useSidebarActions: () => ({
    handleDeleteRequest: vi.fn(),
    handleDeleteConfirm: vi.fn(),
    handleTogglePin: vi.fn(),
    handleOpenInAIChat: vi.fn(),
    handleDuplicate: vi.fn(),
  }),
}));

import MobileNoteActions from "@/components/notes/mobile-note-actions";

function ClosableActions({ noteId }: { noteId: string }) {
  const [open, setOpen] = useState(true);
  return open ? <MobileNoteActions noteId={noteId} onClose={() => setOpen(false)} /> : null;
}

describe("MobileNoteActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.moveItem.mockResolvedValue(undefined);
    mocks.mutateNote.mockResolvedValue(undefined);
  });

  it("renames an item using the entered name", async () => {
    render(<ClosableActions noteId="note-a" />);

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Exam revision" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.mutateNote).toHaveBeenCalledWith("note-a", {
        title: "Exam revision",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps a failed rename open with the entered name and an error", async () => {
    mocks.mutateNote.mockRejectedValueOnce(new Error("Offline"));
    render(<ClosableActions noteId="note-a" />);
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Revision" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveProperty("value", "Revision");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("excludes a folder and its descendants from move destinations, then moves to an allowed folder", async () => {
    render(<ClosableActions noteId="folder-a" />);

    fireEvent.click(screen.getByRole("button", { name: "Move to folder" }));
    expect(screen.queryByRole("button", { name: "Folder A" })).toBeNull();
    expect(screen.getByRole("button", { name: "Folder B" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Folder B" }));

    fireEvent.click(screen.getByRole("button", { name: "Move here" }));
    await waitFor(() =>
      expect(mocks.moveItem).toHaveBeenCalledWith({
        noteId: "folder-a",
        expectedParentId: null,
        parentId: "folder-b",
      }),
    );
  });
});
