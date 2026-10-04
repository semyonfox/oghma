import {
  effectiveAssociations,
  type StudyAssignment,
  type StudyBoard,
  type StudyMapSnapshot,
  type StudyMaterial,
  type StudyTopic,
} from "./types";

export const CARD_WIDTH = 240;
export const COLUMN_WIDTH = 284;
export const LEGEND_WIDTH = 300;
export const MODULE_HEADER = 170;
export const ROW_GAP = 172;
export const CARD_GAP = 16;
export const MODULE_GAP = 220;
export const UNSORTED = "unsorted";

export type FlowCardKind = "note" | "pdf" | "image" | "file" | "assignment";
export type WeekSource = "set" | "title" | "folder" | "linked" | null;

export interface FlowTag {
  topicId: string;
  relevance: "core" | "supporting";
  probability: number | null;
  /** classified suggestions stay visible but weigh less until reviewed */
  suggested: boolean;
  /** assignment topics come from the brief naming a topic, not from the classifier */
  mentioned: boolean;
}

export interface FlowItem {
  ref: string;
  id: string;
  mapId: string;
  kind: FlowCardKind;
  title: string;
  week: number | null;
  weekSource: WeekSource;
  tags: FlowTag[];
  height: number;
  material: StudyMaterial | null;
  assignment: StudyAssignment | null;
  /** extracted Markdown shown through its original file instead of a second card */
  textVersionId: string | null;
}

export interface FlowLink {
  id: string;
  source: string;
  target: string;
  label: string;
  origin: "note" | "yours" | "assignment";
}

export interface FlowRow {
  key: string;
  topic: StudyTopic | null;
  y: number;
}

export interface FlowColumn {
  week: number | null;
  x: number;
}

export interface ModuleLayout {
  mapId: string;
  width: number;
  height: number;
  rows: FlowRow[];
  columns: FlowColumn[];
  positions: Map<string, { x: number; y: number; manual: boolean }>;
}

const HEIGHTS: Record<FlowCardKind, number> = { note: 140, file: 140, pdf: 196, image: 196, assignment: 140 };
const EXPLICIT_WEEK = /\b(?:week|wk)\s*[-_#:.]?\s*0?(\d{1,2})\b/i;
const SHORT_WEEK = /(?:^|[\s_([-])w0?(\d{1,2})(?=$|[\s_)\].:-])/i;
const SESSION = /\b(?:lecture|lect|lec|lab|tutorial|tut|practical|session|class|seminar|workshop)\s*[-_#:.]?\s*0?(\d{1,2})\b/i;
const LEADING = /^\s*0?(\d{1,2})\s*[-_.:)]\s*\S/;

function match(pattern: RegExp, text: string | null): number | null {
  if (!text) return null;
  const value = Number(pattern.exec(text)?.[1]);
  return Number.isInteger(value) && value >= 1 && value <= 52 ? value : null;
}

/** explicit week numbers win over lecture or lab numbers, and the title wins over its folder */
export function inferWeek(title: string, folder: string | null): { week: number; source: "title" | "folder" } | null {
  for (const pattern of [EXPLICIT_WEEK, SHORT_WEEK, SESSION, LEADING]) {
    const fromTitle = match(pattern, title);
    if (fromTitle !== null) return { week: fromTitle, source: "title" };
    const fromFolder = match(pattern, folder);
    if (fromFolder !== null) return { week: fromFolder, source: "folder" };
  }
  return null;
}

function cardKind(material: StudyMaterial): FlowCardKind {
  if (!material.isFile) return "note";
  if (material.mimeType === "application/pdf" || (!material.mimeType && /\.pdf$/i.test(material.title))) return "pdf";
  if (material.mimeType?.startsWith("image/") || (!material.mimeType && /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(material.title))) return "image";
  return "file";
}

export function plainText(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const normal = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** assignment briefs are not classified; a topic counts when its name or an alias appears as whole words */
export function mentionedTopics(text: string, topics: StudyTopic[]): string[] {
  const haystack = ` ${normal(text)} `;
  return topics
    .filter((topic) => [topic.name, ...topic.aliases].some((name) => {
      const needle = normal(name);
      return needle.length >= 3 && haystack.includes(` ${needle} `);
    }))
    .map((topic) => topic.id);
}

function tagsFor(material: StudyMaterial, taxonomyVersion: number, topicIds: Set<string>): FlowTag[] {
  return effectiveAssociations(material, taxonomyVersion)
    .filter((association) => topicIds.has(association.topicId))
    .map((association) => ({
      topicId: association.topicId,
      relevance: association.relevance,
      probability: association.probability,
      suggested: association.status === "suggested",
      mentioned: false,
    }))
    .sort((left, right) => Number(right.relevance === "core") - Number(left.relevance === "core")
      || (right.probability ?? 1) - (left.probability ?? 1));
}

const isReferenceMaterial = (material: StudyMaterial) => material.kind === "syllabus" || material.kind === "past_paper";
// extracted Markdown can be stored as an uploaded .md file, so its type decides, not whether it has a file key
const isTextual = (material: StudyMaterial) => !material.isFile || /^text\//.test(material.mimeType ?? "") || /\.(md|markdown|txt)$/i.test(material.title);

/** builds the cards for one module; syllabus and past papers belong to topics and exam history rather than the weekly flow */
export function moduleItems(snapshot: StudyMapSnapshot, board: StudyBoard): FlowItem[] {
  const { map } = snapshot;
  const topicIds = new Set(map.topics.map((topic) => topic.id));
  const materials = snapshot.materials.filter((material) => !isReferenceMaterial(material));
  const byId = new Map(materials.map((material) => [material.noteId, material]));
  const textVersions = new Map<string, string>();
  for (const material of materials) {
    if (!isTextual(material)) continue;
    const original = material.references.find((reference) => {
      const target = byId.get(reference.id);
      return reference.relation === "extraction" && target !== undefined && target.isFile && !isTextual(target);
    });
    if (original && !textVersions.has(original.id)) textVersions.set(original.id, material.noteId);
  }
  const hidden = new Set(textVersions.values());
  const items: FlowItem[] = [];
  for (const material of materials) {
    if (hidden.has(material.noteId)) continue;
    const ref = `note:${material.noteId}`;
    const override = board.weeks[ref];
    const inferred = inferWeek(material.title, material.folder);
    const kind = cardKind(material);
    items.push({
      ref,
      id: material.noteId,
      mapId: map.id,
      kind,
      title: material.title,
      week: override !== undefined ? override || null : inferred?.week ?? null,
      weekSource: override !== undefined ? "set" : inferred?.source ?? null,
      tags: tagsFor(material, map.taxonomyVersion, topicIds),
      height: HEIGHTS[kind],
      material,
      assignment: null,
      textVersionId: textVersions.get(material.noteId) ?? null,
    });
  }
  const notes = [...items];
  for (const assignment of snapshot.assignments) {
    const ref = `assignment:${assignment.id}`;
    const tags: FlowTag[] = mentionedTopics(`${assignment.title} ${plainText(assignment.description)}`, map.topics)
      .map((topicId) => ({ topicId, relevance: "core", probability: null, suggested: false, mentioned: true }));
    const override = board.weeks[ref];
    const titled = inferWeek(assignment.title, null);
    const card: FlowItem = {
      ref,
      id: assignment.id,
      mapId: map.id,
      kind: "assignment",
      title: assignment.title,
      week: null,
      weekSource: null,
      tags,
      height: HEIGHTS.assignment,
      material: null,
      assignment,
      textVersionId: null,
    };
    // without a teaching calendar, an assignment sits after the latest week of the material it most depends on
    const sources = assignmentSources(card, notes);
    const attached = sources.filter((item) => assignment.noteIds.includes(item.id) || assignment.noteIds.includes(item.textVersionId ?? ""));
    const weeks = (attached.length ? attached : sources.slice(0, 3)).map((item) => item.week).filter((week): week is number => week !== null);
    const linked = weeks.length ? Math.max(...weeks) : null;
    card.week = override !== undefined ? override || null : titled?.week ?? linked;
    card.weekSource = override !== undefined ? "set" : titled ? "title" : linked !== null ? "linked" : null;
    items.push(card);
  }
  return items;
}

const coreTopics = (item: FlowItem) => item.tags.filter((tag) => tag.relevance === "core").map((tag) => tag.topicId);

/** keeps the syllabus hierarchy, then chains each sibling to the one it shares most material with */
export function orderTopics(topics: StudyTopic[], items: FlowItem[]): StudyTopic[] {
  const ids = new Set(topics.map((topic) => topic.id));
  const tagged = items.map((item) => new Set(item.tags.map((tag) => tag.topicId)));
  const shared = (left: string, right: string) => tagged.filter((set) => set.has(left) && set.has(right)).length;
  const children = (parentId: string | null) => topics.filter((topic) =>
    parentId === null ? topic.parentId === null || !ids.has(topic.parentId) : topic.parentId === parentId);
  const ordered: StudyTopic[] = [];
  const seen = new Set<string>();
  const walk = (siblings: StudyTopic[]) => {
    const rest = siblings.filter((topic) => !seen.has(topic.id));
    let previous: StudyTopic | null = null;
    while (rest.length) {
      let best = 0;
      if (previous) {
        rest.forEach((topic, index) => {
          if (shared(previous!.id, topic.id) > shared(previous!.id, rest[best].id)) best = index;
        });
      }
      const [next] = rest.splice(best, 1);
      seen.add(next.id);
      ordered.push(next);
      walk(children(next.id));
      previous = next;
    }
  };
  walk(children(null));
  // topics in a parent cycle are still shown
  for (const topic of topics) if (!seen.has(topic.id)) ordered.push(topic);
  return ordered;
}

const weight = (tag: FlowTag) => (tag.relevance === "core" ? 1 : 0.4) * (tag.suggested ? 0.7 : 1) * (tag.mentioned ? 0.8 : 1);

export function layoutModule(
  mapId: string,
  topics: StudyTopic[],
  items: FlowItem[],
  placements: StudyBoard["placements"],
): ModuleLayout {
  const order = orderTopics(topics, items);
  const rows: FlowRow[] = order.map((topic, index) => ({ key: topic.id, topic, y: MODULE_HEADER + 40 + index * ROW_GAP }));
  if (!rows.length || items.some((item) => item.tags.length === 0)) {
    rows.push({ key: UNSORTED, topic: null, y: MODULE_HEADER + 40 + rows.length * ROW_GAP });
  }
  const rowY = new Map(rows.map((row) => [row.key, row.y]));
  const weeks = [...new Set(items.map((item) => item.week).filter((week): week is number => week !== null))].sort((a, b) => a - b);
  const columns: FlowColumn[] = [...weeks, ...(items.some((item) => item.week === null) ? [null] : [])]
    .map((week, index) => ({ week, x: LEGEND_WIDTH + index * COLUMN_WIDTH }));
  const columnX = new Map(columns.map((column) => [column.week, column.x]));
  const manual = new Map(placements.map((placement) => [placement.id, placement]));
  const positions: ModuleLayout["positions"] = new Map();
  let bottom = rows[rows.length - 1].y + ROW_GAP / 2;
  for (const column of columns) {
    const stack = items.filter((item) => item.week === column.week).map((item) => {
      let total = 0;
      let sum = 0;
      for (const tag of item.tags) {
        const y = rowY.get(tag.topicId);
        if (y === undefined) continue;
        total += weight(tag);
        sum += weight(tag) * y;
      }
      const centre = total ? sum / total : rowY.get(UNSORTED) ?? rows[0].y;
      return { item, target: centre - Math.min(item.height / 2, 60) };
    }).sort((left, right) => left.target - right.target || left.item.title.localeCompare(right.item.title));
    let previous = -Infinity;
    const tops = stack.map(({ item, target }) => {
      const top = Math.max(target, previous + CARD_GAP);
      previous = top + item.height;
      return top;
    });
    // crowded weeks drift down; lift the column back towards its topics without crossing the header
    const drift = stack.reduce((sum, entry, index) => sum + tops[index] - entry.target, 0) / Math.max(stack.length, 1);
    const lift = Math.max(0, Math.min(drift, (tops[0] ?? 0) - (MODULE_HEADER + 8)));
    stack.forEach(({ item }, index) => {
      const placed = manual.get(item.ref);
      const position = placed
        ? { x: placed.x, y: placed.y, manual: true }
        : { x: (columnX.get(column.week) ?? LEGEND_WIDTH) + (COLUMN_WIDTH - CARD_WIDTH) / 2, y: tops[index] - lift, manual: false };
      positions.set(item.ref, position);
      bottom = Math.max(bottom, position.y + item.height);
    });
  }
  const right = Math.max(LEGEND_WIDTH + columns.length * COLUMN_WIDTH, ...[...positions.values()].map((position) => position.x + CARD_WIDTH));
  return { mapId, width: right + 48, height: bottom + 72, rows, columns, positions };
}

/** the notes that carry a topic as core, in teaching order */
export function topicTrail(topicId: string, items: FlowItem[], layout: ModuleLayout): FlowItem[] {
  return items
    .filter((item) => item.tags.some((tag) => tag.topicId === topicId && tag.relevance === "core"))
    .sort((left, right) => (left.week ?? 99) - (right.week ?? 99)
      || (layout.positions.get(left.ref)?.y ?? 0) - (layout.positions.get(right.ref)?.y ?? 0));
}

/** notes an assignment draws on: its attached files first, then notes covering the topics it names */
export function assignmentSources(assignment: FlowItem, items: FlowItem[]): FlowItem[] {
  const named = new Set(coreTopics(assignment));
  const attached = new Set(assignment.assignment?.noteIds ?? []);
  const score = (item: FlowItem) => (attached.has(item.id) || attached.has(item.textVersionId ?? "") ? 10 : 0)
    + item.tags.filter((tag) => tag.relevance === "core" && named.has(tag.topicId)).length;
  return items
    .filter((item) => item.kind !== "assignment" && item.mapId === assignment.mapId && score(item) > 0)
    .sort((left, right) => score(right) - score(left) || (left.week ?? 99) - (right.week ?? 99))
    .slice(0, 8);
}

/** stored note references across every loaded module, plus labelled links drawn on each board */
export function flowLinks(modules: Array<{ items: FlowItem[]; board: StudyBoard }>): FlowLink[] {
  const items = modules.flatMap((module) => module.items);
  const byNote = new Map<string, FlowItem>();
  for (const item of items) {
    if (item.kind === "assignment") continue;
    byNote.set(item.id, item);
    if (item.textVersionId) byNote.set(item.textVersionId, item);
  }
  const links: FlowLink[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    for (const reference of item.material?.references ?? []) {
      if (reference.relation === "extraction") continue;
      const target = byNote.get(reference.id);
      const key = `${item.ref}>${target?.ref}`;
      if (!target || target.ref === item.ref || seen.has(key)) continue;
      seen.add(key);
      links.push({ id: `note-${item.id}-${target.id}`, source: item.ref, target: target.ref, label: reference.relation === "attachment" ? "attaches" : "links to", origin: "note" });
    }
  }
  const refs = new Set(items.map((item) => item.ref));
  for (const { board } of modules) {
    for (const link of board.links) {
      if (refs.has(link.source) && refs.has(link.target)) links.push({ ...link, origin: "yours" });
    }
  }
  return links;
}

export interface TopicBridge {
  a: string;
  b: string;
  reason: "same name" | "linked notes";
  count: number;
}

/** relates topics in different modules when they share a name or alias, or when their notes link to each other */
export function topicBridges(modules: Array<{ mapId: string; topics: StudyTopic[]; items: FlowItem[] }>, links: FlowLink[]): TopicBridge[] {
  const bridges = new Map<string, TopicBridge>();
  const put = (a: string, b: string, reason: TopicBridge["reason"]) => {
    const [first, second] = a < b ? [a, b] : [b, a];
    const key = `${first}|${second}|${reason}`;
    const existing = bridges.get(key);
    if (existing) existing.count += 1;
    else bridges.set(key, { a: first, b: second, reason, count: 1 });
  };
  for (const [index, left] of modules.entries()) {
    for (const right of modules.slice(index + 1)) {
      for (const a of left.topics) {
        const names = new Set([a.name, ...a.aliases].map(normal));
        for (const b of right.topics) {
          if ([b.name, ...b.aliases].some((name) => names.has(normal(name)))) put(a.id, b.id, "same name");
        }
      }
    }
  }
  const byRef = new Map(modules.flatMap((module) => module.items.map((item) => [item.ref, item] as const)));
  for (const link of links) {
    const source = byRef.get(link.source);
    const target = byRef.get(link.target);
    if (!source || !target || source.mapId === target.mapId) continue;
    for (const a of coreTopics(source)) for (const b of coreTopics(target)) put(a, b, "linked notes");
  }
  return [...bridges.values()];
}
