"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * App-wide tab presence for chat generation cancellation.
 *
 * Every open tab heartbeats its own id so the chat worker can tell a real
 * disconnect (tab closed → pagehide beacon, or heartbeats going stale) apart
 * from in-app navigation, which never unloads the page. Hidden tabs keep
 * beating — the browser throttles their timers to ~1/min, which the server's
 * staleness window tolerates — so a second open tab keeps a generation alive.
 */

// Mirrors PRESENCE_HEARTBEAT_MS in src/lib/chat/presence.ts (server-only
// module — it pulls in the Redis client, so it can't be imported here).
const HEARTBEAT_MS = 10_000;
const TAB_ID_STORAGE_KEY = "oghma-tab-id";

function getTabId(): string | null {
  try {
    const existing = sessionStorage.getItem(TAB_ID_STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(TAB_ID_STORAGE_KEY, id);
    return id;
  } catch {
    // sessionStorage unavailable (rare privacy modes) — presence simply stays
    // off and generations fall back to running to completion.
    return null;
  }
}

export default function ChatPresenceController() {
  const pathname = usePathname();

  useEffect(() => {
    const tabId = getTabId();
    if (!tabId) return;

    // 401 pauses the loop so logged-out visitors don't spam the endpoint;
    // any wake signal (visibility, pageshow, route change) retries once.
    let paused = false;
    let stopped = false;

    const beat = () => {
      if (paused || stopped) return;
      void fetch("/api/chat/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId }),
      })
        .then((res) => {
          if (res.status === 401) paused = true;
        })
        .catch(() => {});
    };

    const wake = () => {
      if (stopped) return;
      paused = false;
      beat();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") wake();
    };

    const onPageHide = () => {
      try {
        navigator.sendBeacon(
          `/api/chat/presence/disconnect?tab=${encodeURIComponent(tabId)}`,
        );
      } catch {
        // stale-presence fallback on the server covers a lost beacon
      }
    };

    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    window.addEventListener("pageshow", wake);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("pageshow", wake);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
    // pathname dependency: a route change is the only signal that a login may
    // have happened, which must clear the 401 pause. The effect re-runs and
    // beats immediately, so presence recovers right after sign-in.
  }, [pathname]);

  return null;
}
