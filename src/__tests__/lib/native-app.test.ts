// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNativeAppBridge,
  postNativeOAuth,
  postNativeTheme,
  postNativeUpdates,
  supportsNativeOffline,
  postNativeOfflineOpen,
  postNativeOfflineAccount,
  saveNativeOfflineNote,
  syncNativeOfflineAccount,
} from "@/lib/native-app";

function setUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: userAgent,
  });
}

afterEach(() => {
  postNativeOfflineAccount(null);
  Reflect.deleteProperty(window, "ReactNativeWebView");
  setUserAgent("Mozilla/5.0");
  vi.unstubAllGlobals();
});

describe("offline bridge compatibility and account changes", () => {
  const ownerId = "550e8400-e29b-41d4-a716-446655440000";
  const snapshot = { ownerId, note: { id: "550e8400-e29b-41d4-a716-446655440001", title: "Synthetic note", content: "Saved", savedAt: "2026-09-14T12:00:00.000Z" } };

  function setup() {
    setUserAgent("Mozilla/5.0 OghmaNotesAndroid/0.1.4 OghmaNotesOffline/1");
    const postMessage = vi.fn();
    Reflect.set(window, "ReactNativeWebView", { postMessage });
    return postMessage;
  }

  it("does not offer offline actions to existing APKs", () => {
    const postMessage = setup();
    setUserAgent("Mozilla/5.0 OghmaNotesAndroid/0.1.3");
    expect(supportsNativeOffline()).toBe(false);
    expect(postNativeOfflineOpen()).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("sends a validated snapshot for the currently confirmed account", async () => {
    const postMessage = setup();
    postNativeOfflineAccount(ownerId);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(snapshot)));
    await saveNativeOfflineNote(snapshot.note.id);
    expect(JSON.parse(postMessage.mock.calls.at(-1)?.[0])).toEqual({ type: "oghma:offline-save", snapshot });
  });

  it("does not erase downloads just because an account check fails", async () => {
    const postMessage = setup();
    postNativeOfflineAccount(ownerId);
    postMessage.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 401 })));
    await syncNativeOfflineAccount(new AbortController().signal);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("rejects a download that finishes after sign-out", async () => {
    const postMessage = setup();
    postNativeOfflineAccount(ownerId);
    let complete: (response: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((resolve) => { complete = resolve; })));
    const saving = saveNativeOfflineNote(snapshot.note.id);
    postNativeOfflineAccount(null);
    complete(Response.json(snapshot));
    await expect(saving).rejects.toThrow("account changed");
    expect(postMessage.mock.calls.some(([value]) => JSON.parse(value).type === "oghma:offline-save")).toBe(false);
  });

  it("does not resurrect an account from a profile request started before sign-out", async () => {
    const postMessage = setup();
    let complete: (response: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((resolve) => { complete = resolve; })));
    const checking = syncNativeOfflineAccount(new AbortController().signal);
    postNativeOfflineAccount(null);
    complete(Response.json({ user: { user_id: ownerId } }));
    await checking;
    expect(postMessage.mock.calls).toEqual([[JSON.stringify({ type: "oghma:offline-account", ownerId: null })]]);
  });
});

describe("native app bridge", () => {
  it("dispatches only the supported messages through an Android webview bridge", () => {
    const postMessage = vi.fn();
    setUserAgent("Mozilla/5.0 OghmaNotesAndroid/0.1.3");
    Reflect.set(window, "ReactNativeWebView", { postMessage });

    expect(postNativeOAuth("google")).toBe(true);
    expect(postNativeUpdates()).toBe(true);
    expect(postNativeTheme("dark")).toBe(true);
    expect(postMessage.mock.calls).toEqual([
      ['{"type":"oghma:oauth","provider":"google"}'],
      ['{"type":"oghma:updates"}'],
      ['{"type":"oghma:theme","theme":"dark"}'],
    ]);
  });

  it("does nothing outside the Android app", () => {
    const postMessage = vi.fn();
    setUserAgent("Mozilla/5.0");
    Reflect.set(window, "ReactNativeWebView", { postMessage });

    expect(getNativeAppBridge()).toBeNull();
    expect(postNativeUpdates()).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("rejects an unknown bridge shape", () => {
    setUserAgent("Mozilla/5.0 OghmaNotesAndroid/0.1.3");
    Reflect.set(window, "ReactNativeWebView", { postMessage: "not a function" });

    expect(getNativeAppBridge()).toBeNull();
    expect(postNativeUpdates()).toBe(false);
  });

  it("reports a failed native dispatch without throwing", () => {
    setUserAgent("Mozilla/5.0 OghmaNotesAndroid/0.1.3");
    Reflect.set(window, "ReactNativeWebView", {
      postMessage: () => {
        throw new Error("bridge unavailable");
      },
    });

    expect(postNativeUpdates()).toBe(false);
  });
});
