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
    noteCacheClear: vi.fn(async () => {}),
    clearAllDrafts: vi.fn(async () => {}),
    removeUiItem: vi.fn(async () => {}),
    layoutReset: vi.fn(),
    beginDraftCacheReset: vi.fn(() => 1),
    finishDraftCacheReset: vi.fn(),
  };
});

vi.mock("@/lib/notes/cache", () => ({
  noteCacheInstance: { clear: mocks.noteCacheClear },
  uiCache: { removeItem: mocks.removeUiItem },
}));
vi.mock("@/lib/notes/draft-cache", () => ({
  beginDraftCacheReset: mocks.beginDraftCacheReset,
  clearAllDrafts: mocks.clearAllDrafts,
  finishDraftCacheReset: mocks.finishDraftCacheReset,
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
    mocks.noteCacheClear.mockResolvedValue(undefined);
    mocks.clearAllDrafts.mockResolvedValue(undefined);
    mocks.removeUiItem.mockResolvedValue(undefined);
  });

  it("adopts a persisted same-account cache without clearing drafts or panes", async () => {
    localStorage.setItem("oghmaNotes-workspace-owner", JSON.stringify("user-1"));
    localStorage.setItem("canvas_active_job", JSON.stringify({ jobId: "job-1" }));

    await expect(reconcileWorkspaceSession("user-1")).resolves.toBe(false);

    expect(mocks.noteCacheClear).not.toHaveBeenCalled();
    expect(mocks.clearAllDrafts).not.toHaveBeenCalled();
    expect(mocks.layoutReset).not.toHaveBeenCalled();
    expect(localStorage.getItem("canvas_active_job")).not.toBeNull();
    expect(mocks.noteState).toMatchObject({
      ownerUserId: "user-1",
      sessionReady: true,
    });
  });

  it("clears user data and panes when the persisted owner changes", async () => {
    localStorage.setItem("oghmaNotes-workspace-owner", JSON.stringify("user-1"));
    localStorage.setItem("canvas_active_job", JSON.stringify({ jobId: "job-1" }));

    await expect(reconcileWorkspaceSession("user-2")).resolves.toBe(true);

    expect(mocks.noteCacheClear).toHaveBeenCalledOnce();
    expect(mocks.clearAllDrafts).toHaveBeenCalledOnce();
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
