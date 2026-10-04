// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createNote: vi.fn(),
  bulkDelete: vi.fn(),
  loadChildren: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  setPaneA: vi.fn(),
  searchOpen: vi.fn(),
  search: "",
  tree: {
    items: {
      root: {
        id: "root",
        children: ["folder-a"],
        childrenLoaded: true,
        isFolder: true,
      },
      "folder-a": {
        id: "folder-a",
        children: [],
        childrenLoaded: true,
        isFolder: true,
        data: { id: "folder-a", title: "Course work", pinned: 0 },
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  __esModule: true,
  default: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values
        ? key.replace(/\{(\w+)\}/g, (_, name: string) =>
            String(values[name] ?? ""),
          )
        : key,
  }),
}));
vi.mock("@/lib/notes/state/tree", () => {
  const state = {
    get tree() {
      return mocks.tree;
    },
    initLoaded: true,
    error: "",
    loadChildren: mocks.loadChildren,
    loadingChildren: new Set<string>(),
    generation: 1,
    genNewId: () => "new-note",
  };
  const store = (selector: (value: typeof state) => unknown) => selector(state);
  store.getState = () => state;
  return { __esModule: true, default: store };
});
vi.mock("@/lib/notes/state/note", () => ({
  __esModule: true,
  default: { getState: () => ({ createNote: mocks.createNote }) },
}));
vi.mock("@/lib/notes/state/layout.zustand", () => ({
  __esModule: true,
  default: { getState: () => ({ setPaneA: mocks.setPaneA }) },
}));
vi.mock("@/lib/global-search/state", () => ({
  __esModule: true,
  default: { getState: () => ({ open: mocks.searchOpen }) },
}));
vi.mock("@/components/navigation/mobile-sheet", () => ({
  default: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <section role="dialog" aria-label={title}>
        {children}
      </section>
    ) : null,
}));
vi.mock("@/components/notes/mobile-note-actions", () => ({
  default: () => null,
  mobileActionClass: "mobile-action",
}));
vi.mock("@/components/notes/sidebar/use-sidebar-actions", () => ({
  useSidebarActions: () => ({
    handleUploadFiles: vi.fn(),
    handleBulkDeleteRequest: mocks.bulkDelete,
    handleDeleteConfirm: vi.fn(),
  }),
}));

import MobileLibrary, {
  mobileFolderHref,
} from "@/components/notes/mobile-library";

describe("MobileLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = "";
    mocks.tree = {
      items: {
        root: {
          id: "root",
          children: ["folder-a"],
          childrenLoaded: true,
          isFolder: true,
        },
        "folder-a": {
          id: "folder-a",
          children: [],
          childrenLoaded: true,
          isFolder: true,
          data: { id: "folder-a", title: "Course work", pinned: 0 },
        },
      },
    };
    mocks.createNote.mockResolvedValue({
      id: "new-note",
      title: "Revision plan",
      content: "\n",
      isFolder: false,
    });
  });

  it("encodes folder paths without changing the root destination", () => {
    expect(mobileFolderHref([])).toBe("/notes");
    expect(mobileFolderHref(["folder-a", "folder b"])).toBe(
      "/notes?folder=folder-a%2Ffolder%20b",
    );
  });

  it("creates a named note in the current folder and opens it", async () => {
    mocks.search = "folder=folder-a";
    render(<MobileLibrary />);

    await waitFor(() =>
      expect(mocks.loadChildren).toHaveBeenCalledWith("folder-a"),
    );
    fireEvent.click(screen.getByRole("button", { name: "New note" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Revision plan" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(mocks.createNote).toHaveBeenCalledWith({
        id: "new-note",
        title: "Revision plan",
        content: "\n",
        isFolder: false,
        pid: "folder-a",
      }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/notes/new-note?folder=folder-a");
  });

  it("loads each folder segment and offers recovery for an invalid path", async () => {
    mocks.search = "folder=missing";
    render(<MobileLibrary />);

    await waitFor(() =>
      expect(
        screen.getByText("This folder is no longer available."),
      ).toBeTruthy(),
    );
    expect(mocks.loadChildren).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "Back to notes" }));
    expect(mocks.replace).toHaveBeenCalledWith("/notes");
  });

  it("enters selection from library options and sends selected items to the bulk Trash flow", async () => {
    render(<MobileLibrary />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Library options" }),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Library options" }));
    fireEvent.click(screen.getByRole("button", { name: "Select items" }));
    fireEvent.click(screen.getByRole("button", { name: "Select Course work" }));
    expect(screen.getByText("1 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trash" }));

    expect(mocks.bulkDelete).toHaveBeenCalledWith(["folder-a"]);
  });
});
