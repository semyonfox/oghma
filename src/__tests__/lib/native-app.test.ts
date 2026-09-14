// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNativeAppBridge,
  postNativeOAuth,
  postNativeTheme,
  postNativeUpdates,
} from "@/lib/native-app";

function setUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: userAgent,
  });
}

afterEach(() => {
  Reflect.deleteProperty(window, "ReactNativeWebView");
  setUserAgent("Mozilla/5.0");
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
