"use client";

const SESSION_KEY = "oghma_marketing_session";
const FIRST_TOUCH_KEY = "oghma_marketing_first_touch";
const LAST_TOUCH_KEY = "oghma_marketing_last_touch";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
];

function safeSessionStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function getMarketingSessionId() {
  if (typeof window === "undefined") return null;

  const storage = safeSessionStorage();
  if (!storage) return randomId();

  const existing = storage.getItem(SESSION_KEY);
  if (existing) return existing;

  const sessionId = randomId();
  storage.setItem(SESSION_KEY, sessionId);
  return sessionId;
}

function readTouch(key) {
  const storage = safeSessionStorage();
  if (!storage) return {};
  try {
    return JSON.parse(storage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

function writeTouch(key, value) {
  const storage = safeSessionStorage();
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value));
}

export function getCurrentUtm() {
  if (typeof window === "undefined") return {};

  const params = new URLSearchParams(window.location.search);
  const current = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) current[key.replace("utm_", "")] = value.slice(0, 120);
  }

  if (Object.keys(current).length > 0) {
    if (Object.keys(readTouch(FIRST_TOUCH_KEY)).length === 0) {
      writeTouch(FIRST_TOUCH_KEY, current);
    }
    writeTouch(LAST_TOUCH_KEY, current);
    return current;
  }

  return readTouch(LAST_TOUCH_KEY);
}

export function getFirstTouchUtm() {
  return readTouch(FIRST_TOUCH_KEY);
}

function getReferrer() {
  if (typeof document === "undefined") return null;
  return document.referrer || null;
}

export function trackMarketingEvent(eventName, options = {}) {
  if (typeof window === "undefined") return;

  const sessionId = getMarketingSessionId();
  const payload = {
    eventName,
    sessionId,
    path: `${window.location.pathname}${window.location.search}`,
    referrer: getReferrer(),
    source: options.source,
    targetUrl: options.targetUrl,
    utm: options.utm || getCurrentUtm(),
    occurredAt: new Date().toISOString(),
    properties: {
      ...options.properties,
      first_touch: getFirstTouchUtm(),
    },
  };

  fetch("/api/marketing/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Oghma-Marketing-Session": sessionId,
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Analytics must never break navigation, signup, or forms.
  });
}
