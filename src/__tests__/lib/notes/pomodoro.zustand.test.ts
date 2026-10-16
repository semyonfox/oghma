// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SESSION_ID = "session-1";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function created(id = SESSION_ID) {
  return { ok: true, json: vi.fn().mockResolvedValue({ id }) };
}

function patchBodies(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

async function loadStore() {
  return import("@/lib/notes/state/pomodoro");
}

describe("pomodoro store", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T09:00:00Z"));
    sessionStorage.clear();
    fetchMock = vi.fn().mockResolvedValue(created());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("ends a finished focus session once even when ticks keep arriving", async () => {
    const { default: store } = await loadStore();
    await store.getState().start({ assignmentId: "assignment-1" });

    vi.advanceTimersByTime(25 * 60_000);
    store.getState().tick();
    store.getState().tick();
    store.getState().tick();

    expect(patchBodies(fetchMock)).toEqual([{ id: SESSION_ID, completed: true }]);
    expect(store.getState()).toMatchObject({
      phase: "short_break",
      completedFocusSessions: 1,
      totalMinutesLogged: 25,
    });
  });

  it("logs nothing for a skipped focus phase", async () => {
    const { default: store } = await loadStore();
    await store.getState().start({});

    vi.advanceTimersByTime(60_000);
    store.getState().skip();

    expect(patchBodies(fetchMock)).toEqual([{ id: SESSION_ID, completed: false }]);
    expect(store.getState()).toMatchObject({
      phase: "short_break",
      completedFocusSessions: 0,
      totalMinutesLogged: 0,
    });
  });

  it("keeps the remaining time and phase length across pause and resume", async () => {
    const { default: store } = await loadStore();
    await store.getState().start({});

    vi.advanceTimersByTime(10 * 60_000);
    store.getState().pause();
    vi.advanceTimersByTime(30 * 60_000);
    store.getState().tick();
    store.getState().resume();
    vi.advanceTimersByTime(60_000);
    store.getState().tick();

    expect(store.getState()).toMatchObject({
      phase: "focus",
      totalSeconds: 25 * 60,
      secondsRemaining: 14 * 60,
    });
  });

  it("closes a server session that started after the user stopped the timer", async () => {
    const slowStart = deferred<ReturnType<typeof created>>();
    fetchMock.mockReturnValueOnce(slowStart.promise);
    const { default: store } = await loadStore();

    const starting = store.getState().start({});
    store.getState().stop();
    slowStart.resolve(created("late-session"));
    await starting;

    expect(store.getState()).toMatchObject({ phase: "idle", activeSessionId: null });
    expect(patchBodies(fetchMock)).toEqual([{ id: "late-session", completed: false }]);
  });

  it("restores a running timer after a reload and catches up to the wall clock", async () => {
    const first = await loadStore();
    await first.default.getState().start({ assignmentTitle: "Essay" });

    vi.resetModules();
    vi.advanceTimersByTime(5 * 60_000);
    const reloaded = await loadStore();
    expect(reloaded.default.getState().phase).toBe("idle");

    await reloaded.restorePomodoro();

    expect(reloaded.default.getState()).toMatchObject({
      phase: "focus",
      assignmentTitle: "Essay",
      activeSessionId: SESSION_ID,
      secondsRemaining: 20 * 60,
    });
  });

  it("drops a timer whose phase ended long before the page came back", async () => {
    const first = await loadStore();
    await first.default.getState().start({});

    vi.resetModules();
    vi.advanceTimersByTime(2 * 60 * 60_000);
    const reloaded = await loadStore();
    await reloaded.restorePomodoro();

    expect(reloaded.default.getState().phase).toBe("idle");
    expect(patchBodies(fetchMock)).toEqual([{ id: SESSION_ID, completed: false }]);
  });
});
