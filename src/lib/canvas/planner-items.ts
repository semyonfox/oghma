import { canvasIdForBigintColumn } from "./id";
import type { CanvasRecord } from "./client";

export type PlannableType = "assignment" | "quiz" | "discussion_topic" | "announcement" | "calendar_event" | "planner_note" | "other";

interface PlannerOptions {
  isAnnouncement?: boolean;
  canvasDomain?: string;
  canvasUserId?: string | number | null;
}

export interface NormalizedPlannerItem {
  canvas_domain: string | null;
  canvas_user_id: string | null;
  canvas_course_id: string | null;
  canvas_context_type: string | null;
  canvas_context_id: string | null;
  context_name: string | null;
  plannable_type: PlannableType;
  plannable_id: string;
  canvas_planner_item_id: string | null;
  title: string;
  body: string | null;
  html_url: string | null;
  source: "canvas";
  item_state: "active" | "deleted";
  display_at: string | null;
  due_at: string | null;
  available_at: string | null;
  end_at: string | null;
  date_source: string;
  all_day: boolean;
  raw_planner_item: CanvasRecord;
  raw_plannable: CanvasRecord | null;
}

const PLANNABLE_TYPES = new Set<PlannableType>(["assignment", "quiz", "discussion_topic", "announcement", "calendar_event", "planner_note", "other"]);

const TYPE_ALIASES = new Map<string, PlannableType>([
  ["Assignment", "assignment"], ["assignment", "assignment"],
  ["Quiz", "quiz"], ["quiz", "quiz"],
  ["DiscussionTopic", "discussion_topic"], ["discussion_topic", "discussion_topic"], ["discussion", "discussion_topic"],
  ["Announcement", "announcement"], ["announcement", "announcement"],
  ["CalendarEvent", "calendar_event"], ["calendar_event", "calendar_event"],
  ["PlannerNote", "planner_note"], ["planner_note", "planner_note"],
]);

function isRecord(value: unknown): value is CanvasRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asCanvasIdOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return canvasIdForBigintColumn(value);
}

function asCanvasBigintIdOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return canvasIdForBigintColumn(value);
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return null;
}

function readDate(item: CanvasRecord, field: string) {
  const plannable = isRecord(item.plannable) ? item.plannable : {};
  return firstString(item[field], plannable[field]);
}

export function normalizePlannableType(item: unknown, options: PlannerOptions = {}): PlannableType {
  const record = isRecord(item) ? item : {};
  const plannable = isRecord(record.plannable) ? record.plannable : {};
  if (options.isAnnouncement || record.only_announcements === true || record.is_announcement === true || plannable.is_announcement === true) {
    return "announcement";
  }
  const rawType = record.plannable_type ?? record.type ?? plannable.type;
  const normalized = typeof rawType === "string"
    ? TYPE_ALIASES.get(rawType) ?? TYPE_ALIASES.get(rawType.toLowerCase())
    : undefined;
  return normalized && PLANNABLE_TYPES.has(normalized) ? normalized : "other";
}

export function choosePlannerDates(item: unknown, options: PlannerOptions = {}) {
  const record = isRecord(item) ? item : {};
  const plannable = isRecord(record.plannable) ? record.plannable : {};
  const type = normalizePlannableType(record, options);
  const dueAt = readDate(record, "due_at");
  const todoDate = readDate(record, "todo_date") ?? readDate(record, "todo_at");
  const plannableDate = readDate(record, "plannable_date");
  const postedAt = readDate(record, "posted_at");
  const delayedPostAt = readDate(record, "delayed_post_at");
  const startAt = readDate(record, "start_at");
  const availableAt = readDate(record, "available_at") ?? readDate(record, "unlock_at");
  const endAt = readDate(record, "end_at") ?? readDate(record, "lock_at");
  let display_at: string | null = null;
  let date_source = "none";
  let normalizedDueAt: string | null = null;
  if ((type === "assignment" || type === "quiz") && dueAt) {
    display_at = dueAt;
    normalizedDueAt = dueAt;
    date_source = "due_at";
  } else if (type === "announcement" && delayedPostAt) {
    display_at = delayedPostAt;
    date_source = "delayed_post_at";
  } else if (type === "announcement" && postedAt) {
    display_at = postedAt;
    date_source = "posted_at";
  } else if (type === "calendar_event" && startAt) {
    display_at = startAt;
    date_source = "start_at";
  } else if (todoDate) {
    display_at = todoDate;
    date_source = "todo_date";
  } else if (plannableDate) {
    display_at = plannableDate;
    date_source = "plannable_date";
  }
  return { display_at, due_at: normalizedDueAt, available_at: availableAt, end_at: endAt, date_source, all_day: Boolean(record.all_day ?? plannable.all_day ?? false) };
}

export function normalizePlannerItem(item: unknown, options: PlannerOptions = {}): NormalizedPlannerItem {
  if (!isRecord(item)) throw new Error("Canvas planner item must be an object");
  const plannable = isRecord(item.plannable) ? item.plannable : {};
  const plannableType = normalizePlannableType(item, options);
  const plannableId = asCanvasIdOrNull(item.plannable_id ?? plannable.id ?? item.id);
  if (!plannableId) throw new Error("Canvas planner item is missing a stable plannable id");
  const title = firstString(item.title, item.name, plannable.title, plannable.name) ?? "Untitled Canvas item";
  const dates = choosePlannerDates({ ...item, plannable_type: plannableType }, options);
  return {
    canvas_domain: options.canvasDomain ?? null,
    canvas_user_id: asCanvasBigintIdOrNull(options.canvasUserId ?? item.user_id),
    canvas_course_id: asCanvasBigintIdOrNull(item.course_id ?? item.canvas_course_id ?? plannable.course_id),
    canvas_context_type: firstString(item.context_type),
    canvas_context_id: asCanvasBigintIdOrNull(item.context_id),
    context_name: firstString(item.context_name),
    plannable_type: plannableType,
    plannable_id: plannableId,
    canvas_planner_item_id: asCanvasIdOrNull(item.id ?? item.planner_item_id),
    title,
    body: firstString(item.body, item.description, plannable.body, plannable.message, plannable.description),
    html_url: firstString(item.html_url, item.url, plannable.html_url, plannable.url),
    source: "canvas",
    item_state: item.workflow_state === "deleted" || item.deleted === true ? "deleted" : "active",
    ...dates,
    raw_planner_item: item,
    raw_plannable: Object.keys(plannable).length > 0 ? plannable : null,
  };
}

export function buildAssignmentDedupeKey(item: unknown) {
  if (!isRecord(item)) return null;
  if (item.plannable_type !== "assignment" && item.plannable_type !== "quiz") return null;
  const id = asCanvasIdOrNull(item.plannable_id);
  return id ? `assignment:${id}` : null;
}
