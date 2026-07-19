import { NextRequest, NextResponse } from "next/server";
import sql from "@/database/pgsql.js";
import { cleanAttribution } from "./attribution";

const MAX_TEXT_LENGTH = 512;

const ALLOWED_EVENTS = new Set([
  "page_view", "navigation_transition", "cta_click", "nav_click", "pricing_click",
  "contact_form_start", "contact_form_submit", "contact_form_success", "contact_form_error",
  "registration_form_start", "registration_submit", "registration_success", "registration_error",
  "registration_oauth_start", "registration_oauth_unavailable", "canvas_connect_attempt",
  "canvas_connect_success", "canvas_connect_error",
  "email_verified", "canvas_import_started", "canvas_import_completed",
  "first_cited_answer", "first_flashcard_generated",
]);

/** Server-canonical, once-per-account first-value milestones. */
export const ACTIVATION_MILESTONES = new Set([
  "email_verified",
  "canvas_import_started",
  "canvas_import_completed",
  "first_cited_answer",
  "first_flashcard_generated",
]);

// Navigation accepts only stable, public routes. Dynamic IDs and arbitrary paths are excluded.
const NAVIGATION_PATHS = new Set([
  "/", "/about", "/ai", "/agents.md", "/blog", "/contact", "/cookies", "/faq.md",
  "/llms.txt", "/login", "/pricing", "/privacy", "/register", "/syntax-guide", "/terms",
]);
const NAVIGATION_ORIGINS = new Set(["direct", "external", "internal"]);
const NAVIGATION_PLACEMENTS = new Set([
  "header", "footer", "hero", "midpage_cta", "primary_ctas", "questions",
]);
const NAVIGATION_ACTIONS = new Set([
  "nav_link", "connect_canvas_free", "compare_notebooklm", "view_semester_pricing",
  "ask_about_beta_or_pilot", "contact_team",
]);

const CONTACT_ROLES = new Set(["student", "lecturer", "university_staff", "partner_or_press"]);
const CONTACT_INTERESTS = new Set(["beta_access", "campus_pilot", "support", "billing", "partnership"]);
const MESSAGE_LENGTH_BUCKETS = new Set(["0-100", "101-500", "500+"]);

export interface MarketingEventInput {
  eventName?: unknown;
  event?: unknown;
  userId?: string | null;
  path?: unknown;
  referrer?: unknown;
  source?: unknown;
  targetUrl?: unknown;
  fromPath?: unknown;
  toPath?: unknown;
  originClass?: unknown;
  placement?: unknown;
  action?: unknown;
  utm?: { source?: unknown; medium?: unknown; campaign?: unknown; content?: unknown; term?: unknown };
  properties?: unknown;
}

function cleanText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function cleanEventName(input: MarketingEventInput): string | null {
  const eventName = cleanText(input.eventName ?? input.event, 96);
  return eventName && ALLOWED_EVENTS.has(eventName) ? eventName : null;
}

export function cleanPath(value: unknown): string | null {
  const text = cleanText(value, 300);
  if (!text) return null;
  if (text.startsWith("/")) return text.split(/[?#]/, 1)[0].slice(0, 300);
  try { return new URL(text).pathname.slice(0, 300); } catch { return null; }
}

export function cleanUrl(value: unknown): string | null {
  return cleanPath(value);
}

/** Only stable public paths are accepted for navigation aggregation. */
export function cleanNavigationPath(value: unknown): string | null {
  const path = cleanPath(value);
  if (!path) return null;
  if (NAVIGATION_PATHS.has(path)) return path;
  return /^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path) ? path : null;
}

function cleanNavigationValue(value: unknown, allowlist: Set<string>): string | null {
  const text = cleanText(value, 80);
  return text && allowlist.has(text) ? text : null;
}

export const cleanNavigationOrigin = (value: unknown) => cleanNavigationValue(value, NAVIGATION_ORIGINS);
export const cleanNavigationPlacement = (value: unknown) => cleanNavigationValue(value, NAVIGATION_PLACEMENTS);
export const cleanNavigationAction = (value: unknown) => cleanNavigationValue(value, NAVIGATION_ACTIONS);

function cleanReferrer(value: unknown): string | null {
  const text = cleanText(value, 300);
  if (!text) return null;
  try { return new URL(text).hostname.slice(0, 160); } catch { return null; }
}

/**
 * Properties are a closed aggregate schema. Never retain free-form browser or
 * form values merely because their key does not look sensitive.
 */
export function cleanProperties(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  if (typeof input.has_phone === "boolean") output.has_phone = input.has_phone;
  if (typeof input.has_institution === "boolean") output.has_institution = input.has_institution;
  if (typeof input.notification_delivered === "boolean") output.notification_delivered = input.notification_delivered;
  if (input.form === "contact") output.form = "contact";
  if (typeof input.role === "string" && CONTACT_ROLES.has(input.role)) output.role = input.role;
  if (typeof input.interest === "string" && CONTACT_INTERESTS.has(input.interest)) output.interest = input.interest;
  if (typeof input.message_length_bucket === "string" && MESSAGE_LENGTH_BUCKETS.has(input.message_length_bucket)) {
    output.message_length_bucket = input.message_length_bucket;
  }
  return output;
}

export function hasPrivacySignal(request: Request | NextRequest): boolean {
  const dnt = request.headers.get("dnt")?.toLowerCase();
  return request.headers.get("sec-gpc") === "1" || dnt === "1" || dnt === "yes";
}

export async function recordMarketingEvent(input: MarketingEventInput, request?: Request | NextRequest, options: { trusted?: boolean } = {}): Promise<boolean> {
  if (request && hasPrivacySignal(request)) return false;
  const eventName = cleanEventName(input);
  if (!eventName) return false;
  const fromPath = cleanNavigationPath(input.fromPath);
  const toPath = cleanNavigationPath(input.toPath);
  const originClass = cleanNavigationOrigin(input.originClass);
  const placement = cleanNavigationPlacement(input.placement);
  const action = cleanNavigationAction(input.action);
  // Navigation observations must be useful, coarse dimensions rather than arbitrary payloads.
  if (eventName === "navigation_transition" && (!toPath || !originClass)) return false;
  // Public ingestion cannot associate an observation with an account or retain
  // free-form path, source, target, or attribution values.
  const isPublicIngestion = options.trusted === false;
  const userId = isPublicIngestion ? null : input.userId ?? null;
  const attribution = cleanAttribution(input.utm);

  await sql`
    INSERT INTO app.marketing_events (
      event_name, user_id, path, referrer, source, target_url,
      from_path, to_path, origin_class, placement, action,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term, properties, occurred_at
    ) VALUES (
      ${eventName}, ${userId}, ${isPublicIngestion ? cleanNavigationPath(input.path) : cleanPath(input.path)}, ${isPublicIngestion ? null : cleanReferrer(input.referrer)}, ${isPublicIngestion ? null : cleanText(input.source, 120)}, ${isPublicIngestion ? null : cleanUrl(input.targetUrl)},
      ${fromPath}, ${toPath}, ${originClass}, ${placement}, ${action},
      ${attribution.source ?? null}, ${attribution.medium ?? null}, ${attribution.campaign ?? null}, ${attribution.content ?? null}, ${attribution.term ?? null}, ${sql.json(cleanProperties(input.properties))}, ${new Date()}
    )`;
  return true;
}

/**
 * Records an authenticated first-value milestone once. This intentionally accepts
 * neither paths nor properties: account ID + milestone name are all it stores.
 * The partial unique index from migration 038 is the idempotence boundary.
 */
export async function recordActivationMilestone(
  eventName: string,
  userId: string | null | undefined,
  request?: Request | NextRequest,
): Promise<boolean> {
  if (!userId || !ACTIVATION_MILESTONES.has(eventName) || (request && hasPrivacySignal(request))) return false;
  const inserted = await sql`
    INSERT INTO app.marketing_events (event_name, user_id, properties, occurred_at)
    VALUES (${eventName}, ${userId}, '{}'::jsonb, ${new Date()})
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  return inserted.length > 0;
}

export function marketingEventResponse(ok: boolean, status = 202): NextResponse {
  return NextResponse.json({ ok }, { status });
}
