"use client";

import { useEffect, useState } from "react";

export type NativeOAuthProvider = "google" | "github";

type NativeAppMessage =
  | { type: "oghma:oauth"; provider: NativeOAuthProvider }
  | { type: "oghma:updates" }
  | { type: "oghma:theme"; theme: "dark" | "light" };

type ReactNativeWebView = {
  postMessage(message: string): void;
};

function isReactNativeWebView(value: unknown): value is ReactNativeWebView {
  return (
    typeof value === "object" &&
    value !== null &&
    "postMessage" in value &&
    typeof value.postMessage === "function"
  );
}

export function getNativeAppBridge(): ReactNativeWebView | null {
  if (
    typeof window === "undefined" ||
    !navigator.userAgent.includes("OghmaNotesAndroid/")
  ) {
    return null;
  }

  const candidate: unknown = Reflect.get(window, "ReactNativeWebView");
  return isReactNativeWebView(candidate) ? candidate : null;
}

function postNativeAppMessage(message: NativeAppMessage): boolean {
  const bridge = getNativeAppBridge();
  if (!bridge) return false;

  try {
    bridge.postMessage(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

export function postNativeOAuth(provider: NativeOAuthProvider): boolean {
  return postNativeAppMessage({ type: "oghma:oauth", provider });
}

export function postNativeUpdates(): boolean {
  return postNativeAppMessage({ type: "oghma:updates" });
}

export function postNativeTheme(theme: "dark" | "light"): boolean {
  return postNativeAppMessage({ type: "oghma:theme", theme });
}

export function useNativeAppBridge(): ReactNativeWebView | null {
  const [bridge, setBridge] = useState<ReactNativeWebView | null>(null);

  useEffect(() => {
    setBridge(getNativeAppBridge());
  }, []);

  return bridge;
}
