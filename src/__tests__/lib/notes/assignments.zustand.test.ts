// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

function okJson(body: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(body),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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

  it("keeps the newest assignment request when an older request resolves last", async () => {
    const first = deferred<ReturnType<typeof okJson>>();
    const second = deferred<ReturnType<typeof okJson>>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetchMock);
    const useAssignmentStore = await loadStore();

    const oldRequest = useAssignmentStore.getState().fetchAssignments({ all: false });
    const newRequest = useAssignmentStore.getState().fetchAssignments({ all: true });

    second.resolve(okJson([{ id: "new" }]));
    await newRequest;
    first.resolve(okJson([{ id: "old" }]));
    await oldRequest;

    expect(useAssignmentStore.getState().assignments).toEqual([{ id: "new" }]);
    expect(useAssignmentStore.getState().loading).toBe(false);
  });

  it("retains cached assignments and exposes fetch failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const useAssignmentStore = await loadStore();
    useAssignmentStore.setState({ assignments: [{ id: "cached" }] as never });

    await useAssignmentStore.getState().fetchAssignments();

    expect(useAssignmentStore.getState().assignments).toEqual([{ id: "cached" }]);
    expect(useAssignmentStore.getState().hasLoaded).toBe(true);
    expect(useAssignmentStore.getState().error).toBe("fetch failed");
  });
});
