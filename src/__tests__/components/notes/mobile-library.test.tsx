// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestItem = {
  id: string;
  children: string[];
  childrenLoaded?: boolean;
  isFolder?: boolean;
  data?: Record<string, unknown>;
};

const mocks = vi.hoisted(() => ({
  createNote: vi.fn(),
  bulkDelete: vi.fn(),
  loadChildren: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  setPaneA: vi.fn(),
  searchOpen: vi.fn(),
  updateView: vi.fn(),
  search: "",
  generation: 1,
  view: { group: "folders", sort: "name", hideFinished: true, marks: "dots", showFiles: true } as {
    group: "folders" | "tags";
    sort: "name" | "recent";
    hideFinished: boolean;
    marks: "dots";
    showFiles: boolean;
  },
  tree: { items: {} as Record<string, TestItem> },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  __esModule: true,
  default: () => ({
    activeLocale: "en",
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
    get generation() {
      return mocks.generation;
    },
    genNewId: () => "new-note",
    refreshTree: vi.fn(),
  };
  const store = (selector: (value: typeof state) => unknown) => selector(state);
  store.getState = () => state;
  return { __esModule: true, default: store };
});
vi.mock("@/lib/notes/state/note", () => ({
  __esModule: true,
  default: { getState: () => ({ createNote: mocks.createNote }) },
}));
vi.mock("@/lib/notes/state/layout", () => ({
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

vi.mock("@/components/notes/sidebar/use-tree-view-settings", () => ({
  useTreeViewSettings: () => ({ view: mocks.view, updateView: mocks.updateView }),
}));

import MobileLibrary, {
  mobileFolderHref,
} from "@/components/notes/mobile-library";

function folder(id: string, title: string, pid: string | null, children: string[], data: Record<string, unknown> = {}): TestItem {
  return {
    id,
    children,
    childrenLoaded: true,
    isFolder: true,
    data: { id, title, pinned: 0, isFolder: true, ...(pid ? { pid } : {}), ...data },
  };
}

function note(id: string, title: string, pid: string | null, data: Record<string, unknown> = {}): TestItem {
  return { id, children: [], isFolder: false, data: { id, title, pinned: 0, ...(pid ? { pid } : {}), ...data } };
}

function treeOf(items: TestItem[]) {
  const roots = items.filter((entry) => !entry.data?.pid).map((entry) => entry.id);
  return {
    items: {
      root: { id: "root", children: roots, childrenLoaded: true, isFolder: true },
      ...Object.fromEntries(items.map((entry) => [entry.id, entry])),
    } as Record<string, TestItem>,
  };
}

const treeitem = (name: string) => screen.getByRole("treeitem", { name });

describe("MobileLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = "";
    // a new session each test, so open branches remembered by the last one don't carry over
    mocks.generation += 1;
    mocks.view = { ...mocks.view, group: "folders", sort: "name" };
    mocks.tree = treeOf([
      folder("folder-a", "Course work", null, []),
    ]);
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
      expect(
        screen.getByRole("button", { name: "New note" }).hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(mocks.loadChildren).toHaveBeenCalledWith("folder-a");
    fireEvent.click(screen.getByRole("button", { name: "New note" }));
    expect(screen.getByText("In Course work")).toBeTruthy();
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

  it("expands a folder in place in course order and collapses it again", async () => {
    mocks.tree = treeOf([
      folder("course", "CT331", null, ["w10", "w2", "mine", "summary"]),
      folder("w10", "Week 10", "course", [], { modulePosition: 1 }),
      folder("w2", "Week 2", "course", [], { modulePosition: 2 }),
      folder("mine", "My revision", "course", []),
      note("summary", "Summary", "course"),
    ]);
    render(<MobileLibrary />);

    expect(screen.getByRole("tree")).toBeTruthy();
    expect(treeitem("CT331").getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "CT331" }));
    expect(treeitem("CT331").getAttribute("aria-expanded")).toBe("true");
    const group = within(treeitem("CT331")).getByRole("group");
    expect(within(group).getAllByRole("treeitem").map((entry) => entry.getAttribute("aria-label"))).toEqual([
      "Week 10",
      "Week 2",
      "My revision",
      "Summary",
    ]);
    expect(treeitem("Week 2").getAttribute("aria-level")).toBe("2");

    fireEvent.click(screen.getByRole("button", { name: "CT331" }));
    expect(treeitem("CT331").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("treeitem", { name: "Week 2" })).toBeNull();
  });

  it("loads a folder's children the first time it opens", () => {
    mocks.tree = treeOf([{ ...folder("course", "CT331", null, []), childrenLoaded: false }]);
    render(<MobileLibrary />);

    fireEvent.click(screen.getByRole("button", { name: "CT331" }));
    expect(mocks.loadChildren).toHaveBeenCalledWith("course");
    expect(within(treeitem("CT331")).getByRole("status").textContent).toBe("Loading...");
  });

  it("opens a deep link with its whole branch expanded and files open with their path", async () => {
    mocks.search = "folder=course/labs";
    mocks.tree = treeOf([
      folder("course", "CT331", null, ["labs"]),
      folder("labs", "Labs", "course", ["lab3"]),
      note("lab3", "Lab 3", "labs"),
      folder("other", "MA284", null, []),
    ]);
    render(<MobileLibrary />);

    await waitFor(() => expect(treeitem("Labs").getAttribute("aria-expanded")).toBe("true"));
    expect(treeitem("CT331").getAttribute("aria-expanded")).toBe("true");
    expect(treeitem("MA284").getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Lab 3" }));
    expect(mocks.push).toHaveBeenCalledWith("/notes/lab3?folder=course%2Flabs");
  });

  it("selects rows inside an expanded folder and still lets folders open", async () => {
    mocks.tree = treeOf([
      folder("course", "CT331", null, ["lab3"]),
      note("lab3", "Lab 3", "course"),
    ]);
    render(<MobileLibrary />);

    fireEvent.click(screen.getByRole("button", { name: "Library options" }));
    fireEvent.click(screen.getByRole("button", { name: "Select items" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand CT331" }));
    expect(treeitem("CT331").getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Select Lab 3" }));
    expect(treeitem("Lab 3").getAttribute("aria-selected")).toBe("true");
    expect(treeitem("CT331").getAttribute("aria-selected")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Trash" }));
    expect(mocks.bulkDelete).toHaveBeenCalledWith(["lab3"]);
  });

  it("hides View without a study map but keeps Order for a single course", () => {
    render(<MobileLibrary />);
    expect(screen.queryByRole("group", { name: "View" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Order" })).toBeTruthy();
  });

  it("shows topics for a finished course folded at the bottom", async () => {
    mocks.view = { ...mocks.view, group: "tags" };
    mocks.tree = treeOf([
      folder("course", "CT101", null, ["lab"], {
        hasStudyMap: true,
        course: { canvasStatus: "past", isCanvasCourse: true, override: null, academicYear: "2425" },
      }),
      note("lab", "Lab 1", "course"),
      folder("other", "MA284", null, []),
    ]);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ tags: [], courses: [] })));
    vi.stubGlobal("fetch", fetchMock);
    render(<MobileLibrary />);

    fireEvent.click(screen.getByRole("button", { name: /Finished courses/ }));
    fireEvent.click(screen.getByRole("button", { name: "CT101" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/tree/tags?root=course", { cache: "no-store" }),
    );
    expect(screen.queryByRole("treeitem", { name: "Lab 1" })).toBeNull();
  });

  it("loads topics for a course a deep link opens in Topics view", async () => {
    mocks.view = { ...mocks.view, group: "tags" };
    mocks.search = "folder=course";
    mocks.tree = treeOf([folder("course", "CT331", null, [], { hasStudyMap: true })]);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ tags: [], courses: [] })));
    vi.stubGlobal("fetch", fetchMock);
    render(<MobileLibrary />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/tree/tags?root=course", { cache: "no-store" }),
    );
  });

  it("offers Topics only once a course has a study map, and saves the choice", () => {
    mocks.tree = treeOf([
      folder("course", "CT331", null, [], { hasStudyMap: true }),
      folder("other", "MA284", null, []),
    ]);
    render(<MobileLibrary />);

    fireEvent.click(within(screen.getByRole("group", { name: "View" })).getByRole("button", { name: "Topics" }));
    expect(mocks.updateView).toHaveBeenCalledWith({ group: "tags" });
    fireEvent.change(screen.getByRole("combobox", { name: "Order" }), { target: { value: "recent" } });
    expect(mocks.updateView).toHaveBeenCalledWith({ sort: "recent" });
  });

  it("groups a course under its study-map topics with To review first", async () => {
    mocks.view = { ...mocks.view, group: "tags" };
    mocks.tree = treeOf([
      folder("course", "CT331", null, [], { hasStudyMap: true }),
      folder("other", "MA284", null, ["loose"]),
      note("loose", "Loose", "other"),
    ]);
    const file = (id: string) => ({
      id, noteId: id, title: id, path: "", rootId: "course", isFile: false, mimeType: null,
      main: false, suggested: false, kind: null, editedAt: null,
    });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        tags: [],
        courses: [{
          rootId: "course",
          title: "CT331",
          maps: [{ id: "map", name: "CT331" }],
          topics: [
            { mapId: "map", topicId: "t1", name: "Recursion", topicIndex: 0, files: [file("Summary")], suggestedCount: 0 },
            { mapId: "map", topicId: "t2", name: "Lambda calculus", topicIndex: 1, files: [file("Summary"), file("Lecture 3")], suggestedCount: 0 },
          ],
          review: [{ ...file("Lecture 4"), suggested: true, changed: false, topics: [] }],
          untagged: [],
        }],
      })),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<MobileLibrary />);

    fireEvent.click(screen.getByRole("button", { name: "CT331" }));
    await waitFor(() => expect(treeitem("To review")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/tree/tags?root=course", { cache: "no-store" });
    const course = within(treeitem("CT331")).getByRole("group");
    expect(
      within(course).getAllByRole("treeitem", { expanded: false }).map((entry) => entry.getAttribute("aria-label")),
    ).toEqual(["To review", "Recursion", "Lambda calculus"]);

    fireEvent.click(screen.getByRole("button", { name: /^Recursion/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Lambda calculus/ }));
    expect(screen.getAllByRole("treeitem", { name: "Summary" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Lecture 3" }));
    expect(mocks.push).toHaveBeenCalledWith("/notes/Lecture 3");

    // a course with no map keeps its folders in this view
    fireEvent.click(screen.getByRole("button", { name: "MA284" }));
    expect(treeitem("Loose")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
