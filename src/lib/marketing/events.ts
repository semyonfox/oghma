import { NextRequest } from "next/server";
import sql from "@/database/pgsql.js";

const MAX_TEXT_LENGTH = 512;
const MAX_USER_AGENT_LENGTH = 300;
const MAX_PROPERTY_KEYS = 24;
const MAX_ARRAY_ITEMS = 12;
const MAX_PROPERTY_DEPTH = 2;

const ALLOWED_EVENTS = new Set([
  "page_view",
  "cta_click",
  "nav_click",
  "pricing_click",
  "contact_form_start",
  "contact_form_submit",
  "contact_form_success",
  "contact_form_error",
  "registration_form_start",
  "registration_submit",
  "registration_success",
  "registration_error",
  "registration_oauth_start",
  "registration_oauth_unavailable",
  "canvas_connect_attempt",
  "canvas_connect_success",
  "canvas_connect_error",
]);

const SENSITIVE_KEY_PATTERN =
  /(email|e-mail|password|token|secret|phone|name|message|content|note|document|canvas_token|domain)/i;

const SAFE_AGGREGATE_KEYS = new Set([
  "has_phone",
  "has_institution",
  "message_length_bucket",
]);

export interface MarketingEventInput {
  eventName?: unknown;
  event?: unknown;
  sessionId?: unknown;
  userId?: string | null;
  path?: unknown;
  referrer?: unknown;
  source?: unknown;
  targetUrl?: unknown;
  utm?: {
    source?: unknown;
    medium?: unknown;
    campaign?: unknown;
    content?: unknown;
    term?: unknown;
  };
  properties?: unknown;
  occurredAt?: unknown;
}

function cleanText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function cleanEventName(input: MarketingEventInput): string | null {
  const eventName = cleanText(input.eventName ?? input.event, 96);
  if (!eventName || !ALLOWED_EVENTS.has(eventName)) return null;
  return eventName;
}

function cleanPath(value: unknown): string | null {
  const text = cleanText(value, 300);
  if (!text) return null;
  if (text.startsWith("/")) return text.slice(0, 300);
  try {
    const url = new URL(text);
    return `${url.pathname}${url.search}`.slice(0, 300);
  } catch {
    return null;
  }
}

function cleanUrl(value: unknown): string | null {
  const text = cleanText(value, 300);
  if (!text) return null;
  if (text.startsWith("/")) return text.slice(0, 300);
  try {
    const url = new URL(text);
    return `${url.pathname}${url.search}`.slice(0, 300);
  } catch {
    return null;
  }
}

function cleanReferrer(value: unknown): string | null {
  const text = cleanText(value, 300);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.hostname.slice(0, 160);
  } catch {
    return null;
  }
}

function cleanPropertyValue(value: unknown, depth = 0): unknown {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return cleanText(value, 160);
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => cleanPropertyValue(item, depth + 1))
      .filter((item) => item !== null && item !== undefined);
  }
  if (typeof value === "object" && depth < MAX_PROPERTY_DEPTH) {
    return cleanProperties(value as Record<string, unknown>, depth + 1);
  }
  return null;
}

export function cleanProperties(
  value: unknown,
  depth = 0,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const output: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(
    0,
    MAX_PROPERTY_KEYS,
  )) {
    const key = rawKey.replace(/[^a-zA-Z0-9_:-]/g, "_").slice(0, 80);
    if (
      !key ||
      (!SAFE_AGGREGATE_KEYS.has(key) && SENSITIVE_KEY_PATTERN.test(key))
    ) {
      continue;
    }

    const cleanValue = cleanPropertyValue(rawValue, depth);
    if (cleanValue !== null && cleanValue !== undefined) {
      output[key] = cleanValue;
    }
  }
  return output;
}

function cleanOccurredAt(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const now = Date.now();
  const skewMs = Math.abs(now - date.getTime());
  if (skewMs > 24 * 60 * 60 * 1000) return null;
  return date;
}

export function getMarketingSessionId(request: Request | NextRequest): string | null {
  return cleanText(request.headers.get("x-oghma-marketing-session"), 96);
}

export async function recordMarketingEvent(
  input: MarketingEventInput,
  request?: Request | NextRequest,
): Promise<boolean> {
  const eventName = cleanEventName(input);
  if (!eventName) return false;

  const sessionId =
    cleanText(input.sessionId, 96) ??
    (request ? getMarketingSessionId(request) : null);
  const userAgent = request
    ? cleanText(request.headers.get("user-agent"), MAX_USER_AGENT_LENGTH)
    : null;
  const occurredAt = cleanOccurredAt(input.occurredAt) ?? new Date();

  await sql`
    INSERT INTO app.marketing_events (
      event_name,
      session_id,
      user_id,
      path,
      referrer,
      source,
      target_url,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      properties,
      user_agent,
      occurred_at
    )
    VALUES (
      ${eventName},
      ${sessionId},
      ${input.userId ?? null},
      ${cleanPath(input.path)},
      ${cleanReferrer(input.referrer)},
      ${cleanText(input.source, 120)},
      ${cleanUrl(input.targetUrl)},
      ${cleanText(input.utm?.source, 120)},
      ${cleanText(input.utm?.medium, 120)},
      ${cleanText(input.utm?.campaign, 120)},
      ${cleanText(input.utm?.content, 120)},
      ${cleanText(input.utm?.term, 120)},
      ${sql.json(cleanProperties(input.properties))},
      ${userAgent},
      ${occurredAt}
    )
  `;

  return true;
}

export function marketingEventResponse(ok: boolean, status = 202): Response {
  return Response.json({ ok }, { status });
}
