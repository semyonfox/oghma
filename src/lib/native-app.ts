"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import {
  offlineSnapshotSchema,
  type OfflineSnapshot,
} from "../../apps/mobile/src/lib/offline-state";

export type NativeOAuthProvider = "google" | "github";

type NativeAppMessage =
  | { type: "oghma:oauth"; provider: NativeOAuthProvider }
  | { type: "oghma:updates" }
  | { type: "oghma:theme"; theme: "dark" | "light" }
  | { type: "oghma:offline-open" }
  | { type: "oghma:offline-account"; ownerId: string | null }
  | { type: "oghma:offline-save"; snapshot: OfflineSnapshot };

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

export function supportsNativeOffline(): boolean {
  return (
    !!getNativeAppBridge() &&
    /(?:^|\s)OghmaNotesOffline\/1(?:\s|$)/.test(navigator.userAgent)
  );
}

let offlineAccount: string | null = null;
let offlineAccountGeneration = 0;

export function postNativeOfflineAccount(ownerId: string | null): boolean {
  if (!supportsNativeOffline()) return false;
  if (ownerId !== null && !z.string().uuid().safeParse(ownerId).success)
    return false;
  if (!ownerId || offlineAccount !== ownerId) ++offlineAccountGeneration;
  offlineAccount = ownerId;
  return postNativeAppMessage({ type: "oghma:offline-account", ownerId });
}

export async function syncNativeOfflineAccount(
  signal: AbortSignal,
): Promise<void> {
  if (!supportsNativeOffline()) return;
  const generation = offlineAccountGeneration;
  const response = await fetch("/api/auth/me", { cache: "no-store", signal });
  if (signal.aborted || generation !== offlineAccountGeneration) return;
  if (!response.ok) return;
  const result = z
    .object({ user: z.object({ user_id: z.string().uuid() }) })
    .safeParse(await response.json());
  if (
    !signal.aborted &&
    generation === offlineAccountGeneration &&
    result.success
  )
    postNativeOfflineAccount(result.data.user.user_id);
}

export function postNativeOfflineOpen(): boolean {
  return (
    supportsNativeOffline() &&
    postNativeAppMessage({ type: "oghma:offline-open" })
  );
}

export async function saveNativeOfflineNote(id: string): Promise<void> {
  if (!supportsNativeOffline())
    throw new Error("Update the Android app to use offline notes.");
  const generation = offlineAccountGeneration;
  const response = await fetch(`/api/notes/${encodeURIComponent(id)}/offline`, {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(
      "Could not download this note. Check your connection and try again.",
    );
  const snapshot = offlineSnapshotSchema.parse(await response.json());
  if (
    generation !== offlineAccountGeneration ||
    snapshot.ownerId !== offlineAccount
  ) {
    throw new Error("Your account changed. Reopen the note and try again.");
  }
  const message: NativeAppMessage = { type: "oghma:offline-save", snapshot };
  if (JSON.stringify(message).length > 250_000)
    throw new Error("This note is too large for offline reading.");
  if (!postNativeAppMessage(message))
    throw new Error(
      "Could not reach the Android app. Reopen it and try again.",
    );
}

export function useNativeAppBridge(): ReactNativeWebView | null {
  const [bridge, setBridge] = useState<ReactNativeWebView | null>(null);

  useEffect(() => {
    setBridge(getNativeAppBridge());
  }, []);

  return bridge;
}
