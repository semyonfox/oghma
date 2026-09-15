// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  interface NoteState {
    ownerUserId: string | null;
    generation: number;
    sessionReady: boolean;
    resetForSession: (userId: string | null) => number;
    markSessionReady: (generation: number) => void;
  }
  interface TreeState {
    ownerUserId: string | null;
    generation: number;
    resetForSession: (userId: string | null) => void;
  }

  const noteState = {} as NoteState;
  noteState.ownerUserId = null;
  noteState.generation = 0;
  noteState.sessionReady = true;
  noteState.resetForSession = vi.fn((userId) => {
    noteState.ownerUserId = userId;
    noteState.generation += 1;
    noteState.sessionReady = false;
    return noteState.generation;
  });
  noteState.markSessionReady = vi.fn((generation) => {
    if (noteState.generation === generation) noteState.sessionReady = true;
  });

  const treeState = {} as TreeState;
  treeState.ownerUserId = null;
  treeState.generation = 0;
  treeState.resetForSession = vi.fn((userId) => {
    treeState.ownerUserId = userId;
    treeState.generation += 1;
  });

  return {
    noteState,
    treeState,
    noteValues: new Map<string, unknown>(),
    uiValues: new Map<string, unknown>(),
    noteCacheClear: vi.fn(async () => {}),
    noteKeys: vi.fn(async () => [] as string[]),
    getNoteItem: vi.fn(async (_key: string) => undefined as unknown),
    getUiItem: vi.fn(async (_key: string) => undefined as unknown),
    setUiItem: vi.fn(async (_key: string, _value: unknown) => {}),
    removeUiItem: vi.fn(async (_key: string) => {}),
    uiKeys: vi.fn(async () => [] as string[]),
    layoutReset: vi.fn(),
  };
});

vi.mock("@/lib/notes/cache", () => ({
  noteCacheInstance: {
    clear: mocks.noteCacheClear,
    keys: mocks.noteKeys,
    getItem: mocks.getNoteItem,
  },
  uiCache: {
    getItem: mocks.getUiItem,
    setItem: mocks.setUiItem,
    removeItem: mocks.removeUiItem,
    keys: mocks.uiKeys,
  },
}));
vi.mock("@/lib/notes/api/request-deduplicator", () => ({
  clearDeduplicationCache: vi.fn(),
}));
vi.mock("@/lib/notes/state/note", () => ({
  default: { getState: () => mocks.noteState },
}));
vi.mock("@/lib/notes/state/tree", () => ({
  default: { getState: () => mocks.treeState },
}));
vi.mock("@/lib/notes/state/layout.zustand", () => ({
  default: { getState: () => ({ resetWorkspace: mocks.layoutReset }) },
}));
vi.mock("@/lib/notes/state/save-indicator", () => ({
  default: { setState: vi.fn() },
}));
vi.mock("@/lib/notes/state/search", () => ({
  default: { setState: vi.fn() },
}));
vi.mock("@/lib/notes/state/sync-status", () => ({
  default: { setState: vi.fn() },
}));
vi.mock("@/lib/notes/state/trash", () => ({
  default: { setState: vi.fn() },
}));

import {
  reconcileWorkspaceSession,
  resetWorkspaceClientState,
} from "@/lib/notes/workspace-lifecycle";

import { writeDraft } from "@/lib/notes/draft-cache";

function resetMemoryState() {
  mocks.noteState.ownerUserId = null;
  mocks.noteState.generation = 0;
  mocks.noteState.sessionReady = true;
  mocks.treeState.ownerUserId = null;
  mocks.treeState.generation = 0;
}

describe("workspace lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    resetMemoryState();
    vi.clearAllMocks();
    mocks.noteValues.clear();
    mocks.uiValues.clear();
    mocks.noteCacheClear.mockImplementation(async () => {
      mocks.noteValues.clear();
    });
    mocks.noteKeys.mockImplementation(async () => [...mocks.noteValues.keys()]);
    mocks.getNoteItem.mockImplementation(async (key) => mocks.noteValues.get(key));
    mocks.getUiItem.mockImplementation(async (key) => mocks.uiValues.get(key));
    mocks.setUiItem.mockImplementation(async (key, value) => {
      mocks.uiValues.set(key, value);
    });
    mocks.removeUiItem.mockImplementation(async (key) => {
      mocks.uiValues.delete(key);
    });
    mocks.uiKeys.mockImplementation(async () => [...mocks.uiValues.keys()]);
  });

  it("adopts a persisted same-account cache without clearing drafts or panes", async () => {
    localStorage.setItem("oghmaNotes-workspace-owner", JSON.stringify("user-1"));
    localStorage.setItem("canvas_active_job", JSON.stringify({ jobId: "job-1" }));
    mocks.noteValues.set("note-1", { content: "saved note" });
    mocks.uiValues.set("draft:note-1", { content: "unsaved draft" });

    await expect(reconcileWorkspaceSession("user-1")).resolves.toBe(false);

    expect(mocks.noteCacheClear).not.toHaveBeenCalled();
    expect(mocks.layoutReset).not.toHaveBeenCalled();
    expect(localStorage.getItem("canvas_active_job")).not.toBeNull();
    expect(mocks.noteValues.has("note-1")).toBe(true);
    expect(mocks.uiValues.has("draft:note-1")).toBe(true);
    expect(mocks.noteState).toMatchObject({
      ownerUserId: "user-1",
      sessionReady: true,
    });
  });

  it("adopts a persisted anonymous workspace only from an explicit null owner", async () => {
    localStorage.setItem("oghmaNotes-workspace-owner", JSON.stringify(null));
    mocks.noteValues.set("note-1", { content: "anonymous note" });

    await expect(reconcileWorkspaceSession(null)).resolves.toBe(false);

    expect(mocks.noteCacheClear).not.toHaveBeenCalled();
    expect(mocks.layoutReset).not.toHaveBeenCalled();
    expect(mocks.noteValues.has("note-1")).toBe(true);
  });

  it.each([JSON.stringify({ userId: "user-1" }), JSON.stringify("")])(
    "treats an invalid persisted owner marker as unowned data: %s",
    async (persistedOwner) => {
      localStorage.setItem("oghmaNotes-workspace-owner", persistedOwner);
      mocks.noteValues.set("note-1", { content: "legacy note" });

      await expect(reconcileWorkspaceSession(null)).resolves.toBe(true);

      expect(mocks.noteCacheClear).toHaveBeenCalledOnce();
      expect(mocks.uiValues.get("legacy-unowned-note:note-1")).toEqual({
        content: "legacy note",
      });
      expect(mocks.layoutReset).toHaveBeenCalledOnce();
    },
  );

  it("clears user data and panes when the persisted owner changes", async () => {
    localStorage.setItem("oghmaNotes-workspace-owner", JSON.stringify("user-1"));
    localStorage.setItem("canvas_active_job", JSON.stringify({ jobId: "job-1" }));

    await expect(reconcileWorkspaceSession("user-2")).resolves.toBe(true);

    expect(mocks.noteCacheClear).toHaveBeenCalledOnce();
    expect(mocks.removeUiItem).toHaveBeenCalledWith("tree");
    expect(mocks.layoutReset).toHaveBeenCalledOnce();
    expect(localStorage.getItem("canvas_active_job")).toBeNull();
    expect(mocks.noteState).toMatchObject({
      ownerUserId: "user-2",
      sessionReady: true,
    });
    expect(localStorage.getItem("oghmaNotes-workspace-owner")).toBe(
      JSON.stringify("user-2"),
    );
  });

  it("quarantines unknown legacy notes and drafts before opening a fresh workspace", async () => {
    const note = { id: "note-1", content: "saved note" };
    const draft = { content: "unsaved draft", draftAt: 1 };
    mocks.noteValues.set("note-1", note);
    mocks.uiValues.set("draft:note-1", draft);

    await expect(reconcileWorkspaceSession("user-1")).resolves.toBe(true);

    expect(mocks.layoutReset).toHaveBeenCalledOnce();
    expect(mocks.noteValues.size).toBe(0);
    expect(mocks.uiValues.has("draft:note-1")).toBe(false);
    expect(mocks.uiValues.get("legacy-unowned-note:note-1")).toEqual(note);
    expect(mocks.uiValues.get("legacy-unowned-draft:note-1")).toEqual(draft);
    expect(mocks.noteState).toMatchObject({
      ownerUserId: "user-1",
      sessionReady: true,
    });

    await resetWorkspaceClientState(null);
    expect(mocks.uiValues.get("legacy-unowned-note:note-1")).toEqual(note);
    expect(mocks.uiValues.get("legacy-unowned-draft:note-1")).toEqual(draft);
  });

  it.each([true, false])("drains a pending draft before resetting, quarantine=%s", async (quarantineUnowned) => {
    let finishWrite!: () => void;
    mocks.setUiItem.mockImplementationOnce(async (key, value) => {
      await new Promise<void>((resolve) => { finishWrite = resolve; });
      mocks.uiValues.set(key, value);
    });
    const writing = writeDraft("pending", "unsaved content");
    const resetting = resetWorkspaceClientState("user-2", { quarantineUnowned });
    await writeDraft("blocked", "must not enter the new workspace");
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.setUiItem).toHaveBeenCalledOnce();
    expect(mocks.uiKeys).not.toHaveBeenCalled();
    expect(mocks.noteState.sessionReady).toBe(false);

    finishWrite();
    await Promise.all([writing, resetting]);
    expect(mocks.uiValues.has("draft:pending")).toBe(false);
    expect(mocks.uiValues.has("draft:blocked")).toBe(false);
    if (quarantineUnowned) {
      expect(mocks.uiValues.get("legacy-unowned-draft:pending")).toMatchObject({
        content: "unsaved content",
      });
    }
    expect(mocks.noteState.sessionReady).toBe(true);
  });

  it("leaves unknown live data blocked and intact until quarantine retry succeeds", async () => {
    const note = { id: "note-1", content: "saved note" };
    const draft = { content: "unsaved draft", draftAt: 1 };
    mocks.noteValues.set("note-1", note);
    mocks.uiValues.set("draft:note-1", draft);
    mocks.setUiItem.mockImplementation(async (key, value) => {
      if (key === "legacy-unowned-note:note-1") {
        throw new Error("backup unavailable");
      }
      mocks.uiValues.set(key, value);
    });

    await expect(reconcileWorkspaceSession("user-1")).rejects.toThrow(
      "backup unavailable",
    );

    expect(mocks.noteCacheClear).not.toHaveBeenCalled();
    expect(mocks.noteValues.get("note-1")).toEqual(note);
    expect(mocks.uiValues.get("draft:note-1")).toEqual(draft);
    expect(mocks.noteState.sessionReady).toBe(false);
    expect(localStorage.getItem("oghmaNotes-workspace-owner")).toBeNull();

    mocks.setUiItem.mockImplementation(async (key, value) => {
      mocks.uiValues.set(key, value);
    });
    await expect(reconcileWorkspaceSession("user-1")).resolves.toBe(true);

    expect(mocks.uiValues.get("legacy-unowned-note:note-1")).toEqual(note);
    expect(mocks.uiValues.get("legacy-unowned-draft:note-1")).toEqual(draft);
    expect(mocks.noteValues.size).toBe(0);
    expect(mocks.noteState.sessionReady).toBe(true);
  });

  it("does not overwrite an existing unknown-data quarantine entry", async () => {
    const existingBackup = { content: "first backup" };
    mocks.noteValues.set("note-1", { content: "retry source" });
    mocks.uiValues.set("legacy-unowned-note:note-1", existingBackup);

    await reconcileWorkspaceSession("user-1");

    expect(mocks.uiValues.get("legacy-unowned-note:note-1")).toEqual(
      existingBackup,
    );
  });

  it("keeps writes blocked until the newest queued clear finishes", async () => {
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    mocks.noteCacheClear
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => (finishFirst = resolve)),
      )
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => (finishSecond = resolve)),
      );

    const first = resetWorkspaceClientState("user-1");
    const second = resetWorkspaceClientState("user-2");
    await vi.waitFor(() => expect(mocks.noteCacheClear).toHaveBeenCalledTimes(1));
    expect(mocks.noteState.sessionReady).toBe(false);

    finishFirst();
    await vi.waitFor(() => expect(mocks.noteCacheClear).toHaveBeenCalledTimes(2));
    expect(mocks.noteState.sessionReady).toBe(false);

    finishSecond();
    await Promise.all([first, second]);
    expect(mocks.noteState).toMatchObject({
      ownerUserId: "user-2",
      sessionReady: true,
    });
  });
});
