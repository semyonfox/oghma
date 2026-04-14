// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

function okJson(body: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(body),
  };
}

const storage = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

async function loadStore() {
  return (await import("@/lib/notes/state/assignments.zustand")).default;
}

describe("assignment store archive visibility", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true,
    });
    storage.getItem.mockReturnValue(null);
    storage.setItem.mockClear();
    storage.removeItem.mockClear();
    storage.clear.mockClear();
  });

  it("uses persisted includeArchived when fetching without explicit options", async () => {
    const useAssignmentStore = await loadStore();
    const fetchMock = vi.fn().mockResolvedValue(okJson([]));
    vi.stubGlobal("fetch", fetchMock);

    useAssignmentStore.setState({
      assignments: [],
      loading: false,
      courseFilter: null,
      activeTab: "upcoming",
      includeAll: true,
      includeArchived: true,
    });

    await useAssignmentStore.getState().fetchAssignments();

    expect(fetchMock).toHaveBeenCalledWith("/api/assignments?all=1&includeArchived=1");
  });

  it("refetches with current includeArchived state after Canvas sync", async () => {
    const useAssignmentStore = await loadStore();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson({ count: 2 }))
      .mockResolvedValueOnce(okJson([]));
    vi.stubGlobal("fetch", fetchMock);

    useAssignmentStore.setState({
      assignments: [],
      loading: false,
      courseFilter: null,
      activeTab: "upcoming",
      includeAll: true,
      includeArchived: true,
    });

    await useAssignmentStore.getState().syncFromCanvas();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/assignments/sync", { method: "POST" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/assignments?all=1&includeArchived=1");
  });

  it("refetches immediately when archived visibility changes", async () => {
    const useAssignmentStore = await loadStore();
    const fetchMock = vi.fn().mockResolvedValue(okJson([]));
    vi.stubGlobal("fetch", fetchMock);

    useAssignmentStore.setState({
      assignments: [],
      loading: false,
      courseFilter: null,
      activeTab: "upcoming",
      includeAll: false,
      includeArchived: false,
    });

    await useAssignmentStore.getState().setIncludeArchived(true);

    expect(useAssignmentStore.getState().includeArchived).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/assignments?includeArchived=1");
  });
});
