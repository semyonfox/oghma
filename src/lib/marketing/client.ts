"use client";

import { cleanAttribution, type Attribution } from "./attribution";

const LEGACY_SESSION_KEY = "oghma_marketing_session";
const FIRST_TOUCH_KEY = "oghma_marketing_first_touch";
const LAST_TOUCH_KEY = "oghma_marketing_last_touch";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
];

interface MarketingEventOptions {
  source?: string;
  targetUrl?: string | null;
  fromPath?: string | null;
  toPath?: string | null;
  originClass?: string | null;
  placement?: string | null;
  action?: string | null;
  pathChain?: string[];
  attributionPath?: string;
  attributionPlacement?: string;
  attributionAction?: string;
  utm?: Attribution;
  properties?: Record<string, unknown>;
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function marketingAnalyticsAllowed(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const gpc = Reflect.get(navigator, "globalPrivacyControl") === true;
  const dnt = navigator.doNotTrack || Reflect.get(window, "doNotTrack");
  return !gpc && dnt !== "1" && dnt !== "yes";
}

function clearAnalyticsStorage() {
  const storage = safeSessionStorage();
  if (!storage) return;
  storage.removeItem(LEGACY_SESSION_KEY);
  storage.removeItem(FIRST_TOUCH_KEY);
  storage.removeItem(LAST_TOUCH_KEY);
}

function retireAnalyticsStorage() {
  // Clear keys created by earlier analytics versions, then remain storage-free.
  clearAnalyticsStorage();
}

export function getCurrentUtm(): Attribution {
  retireAnalyticsStorage();
  if (!marketingAnalyticsAllowed()) return {};

  const params = new URLSearchParams(window.location.search);
  const current: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) current[key.replace("utm_", "")] = value;
  }
  return cleanAttribution(current);
}

export function getMarketingContext(): { utm: Attribution } {
  return { utm: getCurrentUtm() };
}

function getReferrer(): string | null {
  if (typeof document === "undefined") return null;
  return document.referrer || null;
}

export function trackMarketingEvent(
  eventName: string,
  options: MarketingEventOptions = {},
): void {
  if (!marketingAnalyticsAllowed()) {
    clearAnalyticsStorage();
    return;
  }

  const payload = {
    eventName,
    // Never send query strings, browser identifiers, user agent, or client time.
    path: window.location.pathname,
    referrer: getReferrer(),
    source: options.source,
    targetUrl: options.targetUrl,
    // Navigation fields are coarse allowlisted values; the server independently validates them.
    fromPath: options.fromPath,
    toPath: options.toPath,
    originClass: options.originClass,
    placement: options.placement,
    action: options.action,
    // Bounded, allowlisted context only. This contains no session key and is
    // lost when the page is refreshed or the tab is closed.
    pathChain: options.pathChain,
    attributionPath: options.attributionPath,
    attributionPlacement: options.attributionPlacement,
    attributionAction: options.attributionAction,
    utm: options.utm || getCurrentUtm(),
    properties: { ...options.properties },
  };

  fetch("/api/marketing/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Analytics must never break navigation, signup, or forms.
  });
}
