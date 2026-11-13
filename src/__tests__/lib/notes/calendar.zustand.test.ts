// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function response(body: unknown, ok = true) {
  return { ok, json: vi.fn().mockResolvedValue(body) };
}

async function loadStore() {
  return (await import("@/lib/notes/state/calendar")).default;
}

describe("calendar store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true,
    });
    storage.getItem.mockReturnValue(null);
  });

  it("shows linked assignment metadata immediately after creation", async () => {
    const { default: assignments } = await import("@/lib/notes/state/assignments");
    const linkedAssignment = {
      id: "assignment-1", title: "Database report", description: null,
      canvas_course_id: null, canvas_assignment_id: null,
      course_name: "Databases", course_color: "#123456", due_at: null,
      status: "upcoming", estimated_hours: null, logged_hours: 0,
      source: "manual", assignment_type: "manual", submitted_at: null,
      score: null, points_possible: null, created_at: "2026-10-06", updated_at: "2026-10-06",
    } satisfies import("@/lib/notes/state/assignments").Assignment;
    assignments.setState({ assignments: [linkedAssignment] });
    const block = {
      id: "block-1", assignment_id: linkedAssignment.id, title: linkedAssignment.title,
      starts_at: "2026-10-06T09:00:00Z", ends_at: "2026-10-06T10:00:00Z",
      pomodoro_count: 2, completed: false,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(block)));
    const store = await loadStore();
    const created = await store.getState().createTimeBlock(block);
    expect(created).toMatchObject({ assignment_title: linkedAssignment.title, course_color: "#123456" });
    expect(store.getState().timeBlocks[0]).toEqual(created);
    assignments.setState({ assignments: [] });
  });

  it("keeps the newest time-block request when an older request resolves last", async () => {
    const first = deferred<ReturnType<typeof response>>();
    const second = deferred<ReturnType<typeof response>>();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    );
    const store = await loadStore();

    const oldRequest = store.getState().fetchTimeBlocks("old-start", "old-end");
    const newRequest = store.getState().fetchTimeBlocks("new-start", "new-end");

    second.resolve(response([{ id: "new" }]));
    await newRequest;
    first.resolve(response([{ id: "old" }]));
    await oldRequest;

    expect(store.getState().timeBlocks).toEqual([{ id: "new" }]);
    expect(store.getState().loading).toBe(false);
  });

  it("keeps existing data visible when refresh fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, false)));
    const store = await loadStore();
    store.setState({ timeBlocks: [{ id: "existing" }] as never });

    await store.getState().fetchTimeBlocks("start", "end");

    expect(store.getState().timeBlocks).toEqual([{ id: "existing" }]);
    expect(store.getState().error).toBe("fetch failed");
  });

  it("moves the selected date and anchor together", async () => {
    const store = await loadStore();
    store.setState({
      view: "week",
      selectedDate: "2026-07-16",
      currentDate: "2026-07-16T11:00:00.000Z",
    });

    store.getState().navigateForward();

    expect(store.getState().selectedDate).toBe("2026-07-23");
    expect(new Date(store.getState().currentDate).getDate()).toBe(23);
  });

  // without the zone the server buckets review days in UTC, so late-evening
  // reviews land on the wrong day for anyone east or west of it
  it("asks for review dates in the browser's time zone", async () => {
    const real = new Intl.DateTimeFormat().resolvedOptions();
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...real,
      timeZone: "Europe/Dublin",
    });
    const fetchMock = vi.fn().mockResolvedValue(response({ dates: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const store = await loadStore();

    await store.getState().fetchReviewDates("2026-10-01", "2026-10-31");

    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(url.pathname).toBe("/api/quiz/review-dates");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      start: "2026-10-01",
      end: "2026-10-31",
      tz: "Europe/Dublin",
    });
  });
});
