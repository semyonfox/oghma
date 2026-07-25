const PLANNABLE_TYPES = new Set(["assignment", "quiz", "discussion_topic", "announcement", "calendar_event", "planner_note", "other"]);

const TYPE_ALIASES = new Map([
  ["Assignment", "assignment"], ["assignment", "assignment"],
  ["Quiz", "quiz"], ["quiz", "quiz"],
  ["DiscussionTopic", "discussion_topic"], ["discussion_topic", "discussion_topic"], ["discussion", "discussion_topic"],
  ["Announcement", "announcement"], ["announcement", "announcement"],
  ["CalendarEvent", "calendar_event"], ["calendar_event", "calendar_event"],
  ["PlannerNote", "planner_note"], ["planner_note", "planner_note"],
]);

function asTextId(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function asNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return null;
}

function readDate(item, field) {
  const plannable = item?.plannable ?? {};
  return firstString(item?.[field], plannable?.[field]);
}

export function normalizePlannableType(item, options = {}) {
  if (options.isAnnouncement || item?.only_announcements === true || item?.is_announcement === true || item?.plannable?.is_announcement === true) {
    return "announcement";
  }
  const rawType = item?.plannable_type ?? item?.type ?? item?.plannable?.type;
  const normalized = TYPE_ALIASES.get(rawType) ?? TYPE_ALIASES.get(String(rawType ?? "").toLowerCase());
  return normalized && PLANNABLE_TYPES.has(normalized) ? normalized : "other";
}

export function choosePlannerDates(item, options = {}) {
  const type = normalizePlannableType(item, options);
  const dueAt = readDate(item, "due_at");
  const todoDate = readDate(item, "todo_date") ?? readDate(item, "todo_at");
  const plannableDate = readDate(item, "plannable_date");
  const postedAt = readDate(item, "posted_at");
  const delayedPostAt = readDate(item, "delayed_post_at");
  const startAt = readDate(item, "start_at");
  const availableAt = readDate(item, "available_at") ?? readDate(item, "unlock_at");
  const endAt = readDate(item, "end_at") ?? readDate(item, "lock_at");
  let display_at = null;
  let date_source = "none";
  let normalizedDueAt = null;
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
  return { display_at, due_at: normalizedDueAt, available_at: availableAt, end_at: endAt, date_source, all_day: Boolean(item?.all_day ?? item?.plannable?.all_day ?? false) };
}

export function normalizePlannerItem(item, options = {}) {
  const plannable = item?.plannable ?? {};
  const plannableType = normalizePlannableType(item, options);
  const plannableId = asTextId(item?.plannable_id ?? plannable?.id ?? item?.id);
  if (!plannableId) throw new Error("Canvas planner item is missing a stable plannable id");
  const title = firstString(item?.title, item?.name, plannable?.title, plannable?.name) ?? "Untitled Canvas item";
  const dates = choosePlannerDates({ ...item, plannable_type: plannableType }, options);
  return {
    canvas_domain: options.canvasDomain,
    canvas_user_id: asNumberOrNull(options.canvasUserId ?? item?.user_id),
    canvas_course_id: asNumberOrNull(item?.course_id ?? item?.canvas_course_id ?? plannable?.course_id),
    canvas_context_type: item?.context_type ?? null,
    canvas_context_id: asNumberOrNull(item?.context_id),
    context_name: item?.context_name ?? null,
    plannable_type: plannableType,
    plannable_id: plannableId,
    canvas_planner_item_id: asTextId(item?.id ?? item?.planner_item_id),
    title,
    body: firstString(item?.body, item?.description, plannable?.body, plannable?.message, plannable?.description),
    html_url: firstString(item?.html_url, item?.url, plannable?.html_url, plannable?.url),
    source: "canvas",
    item_state: item?.workflow_state === "deleted" || item?.deleted === true ? "deleted" : "active",
    ...dates,
    raw_planner_item: item,
    raw_plannable: Object.keys(plannable).length > 0 ? plannable : null,
  };
}

export function buildAssignmentDedupeKey(item) {
  if (item?.plannable_type !== "assignment" && item?.plannable_type !== "quiz") return null;
  const id = asTextId(item?.plannable_id);
  return id ? `assignment:${id}` : null;
}
