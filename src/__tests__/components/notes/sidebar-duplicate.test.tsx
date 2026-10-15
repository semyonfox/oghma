// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const treeState = {
    tree: {
      rootId: "root",
      items: {
        root: { id: "root", children: ["folder-b"] },
        "folder-b": { id: "folder-b", children: ["note-a"], isFolder: true },
        // tree rows come from /api/tree/children and carry no content
        "note-a": {
          id: "note-a",
          children: [],
          data: { id: "note-a", title: "Draft", pid: "folder-b", deleted: 0, shared: 0, pinned: 0 },
        },
      },
    },
    genNewId: () => "copy-id",
    expandedIds: new Set<string>(),
    selectedIds: new Set<string>(),
  };
  return {
    treeState,
    find: vi.fn(),
    createNote: vi.fn(),
    push: vi.fn(),
    toastError: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  __esModule: true,
  default: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values?.title ? key.replace("{title}", values.title) : key,
  }),
}));
vi.mock("@/lib/notes/state/tree", () => {
  const store = () => mocks.treeState;
  store.getState = () => mocks.treeState;
  return { __esModule: true, default: store };
});
vi.mock("@/lib/notes/state/note", () => {
  const state = {
    createNote: mocks.createNote,
    noteAPI: { find: mocks.find },
  };
  const store = () => state;
  store.getState = () => state;
  return { __esModule: true, default: store };
});

import { useSidebarActions } from "@/components/notes/sidebar/use-sidebar-actions";

function renderActions() {
  return renderHook(() =>
    useSidebarActions({
      setDeleteConfirmTarget: vi.fn(),
      deleteConfirmTarget: null,
      activeId: null,
      setSelectionAnchorId: vi.fn(),
      onDeleteSelectionCleared: vi.fn(),
    }),
  ).result.current;
}

describe("sidebar duplicate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("copies the stored content into the original's folder", async () => {
    // the note response has content but no parent
    mocks.find.mockResolvedValueOnce({ id: "note-a", title: "Draft", content: "# Full note", s3Key: null });
    mocks.createNote.mockResolvedValueOnce({ id: "copy-id" });

    const actions = renderActions();
    await act(() => actions.handleDuplicate("note-a"));

    expect(mocks.find).toHaveBeenCalledWith("note-a", { deduplicate: false });
    expect(mocks.createNote).toHaveBeenCalledWith({
      id: "copy-id",
      title: "Draft (Copy)",
      content: "# Full note",
      pid: "folder-b",
    });
    expect(mocks.push).toHaveBeenCalledWith("/notes/copy-id");
  });

  it("refuses an uploaded file instead of creating an empty namesake", async () => {
    mocks.find.mockResolvedValueOnce({ id: "note-a", title: "slides.pdf", content: "", s3Key: "notes/note-a/slides.pdf" });

    const actions = renderActions();
    await act(() => actions.handleDuplicate("note-a"));

    expect(mocks.createNote).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("Failed to duplicate");
  });
});
