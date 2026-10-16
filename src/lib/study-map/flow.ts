import {
  effectiveAssociations,
  type StudyAssignment,
  type StudyBoard,
  type StudyMapSnapshot,
  type StudyMaterial,
  type StudyTopic,
} from "./types";

export const CARD_WIDTH = 240;
const CARD_GAP = 16;
const CLUSTER_PADDING = 16;
export const CLUSTER_HEADER = 64;
const CLUSTER_GAP = 48;
const SHELF_GAP = 72;
// clusters start below the module title
const CLUSTER_TOP = 120;
const EMPTY_BODY = 40;
export const MODULE_GAP = 220;
export const UNSORTED = "unsorted";

type FlowCardKind = "note" | "pdf" | "image" | "file" | "assignment";
type WeekSource = "set" | "title" | "folder" | "linked" | null;

interface FlowTag {
  topicId: string;
  relevance: "core" | "supporting";
  probability: number | null;
  /** classified suggestions stay visible but weigh less until reviewed */
  suggested: boolean;
  /** assignment topics come from the brief naming a topic, not from the classifier */
  mentioned: boolean;
  /** how often the brief names the topic; 0 for classified material */
  mentions: number;
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

export interface FlowCluster {
  /** topic ID, or UNSORTED */
  key: string;
  topic: StudyTopic | null;
  x: number;
  y: number;
  width: number;
  height: number;
  /** cards whose primary topic this is, in reading order */
  refs: string[];
}

export interface TopicRelation {
  a: string;
  b: string;
  weight: number;
}

export interface ModuleLayout {
  mapId: string;
  width: number;
  height: number;
  clusters: FlowCluster[];
  /** the strongest relations, at most three per topic */
  relations: TopicRelation[];
  /** card ref to the key of the cluster it sits in */
  primary: Map<string, string>;
  positions: Map<string, { x: number; y: number; manual: boolean }>;
}

const HEIGHTS: Record<FlowCardKind, number> = {
  note: 140,
  file: 140,
  pdf: 196,
  image: 196,
  assignment: 140,
};
const EXPLICIT_WEEK = /\b(?:week|wk)\s*[-_#:.]?\s*0?(\d{1,2})\b/i;
const SHORT_WEEK = /(?:^|[\s_([-])w0?(\d{1,2})(?=$|[\s_)\].:-])/i;
const SESSION =
  /\b(?:lecture|lect|lec|lab|tutorial|tut|practical|session|class|seminar|workshop)\s*[-_#:.]?\s*0?(\d{1,2})\b/i;
const LEADING = /^\s*0?(\d{1,2})\s*[-_.:)]\s*\S/;

function match(pattern: RegExp, text: string | null): number | null {
  if (!text) return null;
  const value = Number(pattern.exec(text)?.[1]);
  return Number.isInteger(value) && value >= 1 && value <= 52 ? value : null;
}

/** explicit week numbers win over lecture or lab numbers, and the title wins over its folder */
export function inferWeek(
  title: string,
  folder: string | null,
): { week: number; source: "title" | "folder" } | null {
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
  if (
    material.mimeType === "application/pdf" ||
    (!material.mimeType && /\.pdf$/i.test(material.title))
  )
    return "pdf";
  if (
    material.mimeType?.startsWith("image/") ||
    (!material.mimeType &&
      /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(material.title))
  )
    return "image";
  return "file";
}

function plainText(html: string | null): string {
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

const normal = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** assignment briefs are not classified; a topic counts when its name or an alias appears as whole words, most named first */
export function mentionedTopics(
  text: string,
  topics: StudyTopic[],
): Array<{ topicId: string; count: number }> {
  const haystack = ` ${normal(text)} `;
  return topics
    .map((topic) => ({
      topicId: topic.id,
      count: [topic.name, ...topic.aliases].reduce((sum, name) => {
        const needle = normal(name);
        return needle.length >= 3
          ? sum + haystack.split(` ${needle} `).length - 1
          : sum;
      }, 0),
    }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count);
}

function tagsFor(
  material: StudyMaterial,
  taxonomyVersion: number,
  topicIds: Set<string>,
): FlowTag[] {
  return effectiveAssociations(material, taxonomyVersion)
    .filter((association) => topicIds.has(association.topicId))
    .map((association) => ({
      topicId: association.topicId,
      relevance: association.relevance,
      probability: association.probability,
      suggested: association.status === "suggested",
      mentioned: false,
      mentions: 0,
    }))
    .sort(
      (left, right) =>
        Number(right.relevance === "core") -
          Number(left.relevance === "core") ||
        (right.probability ?? 1) - (left.probability ?? 1),
    );
}

const isReferenceMaterial = (material: StudyMaterial) =>
  material.kind === "syllabus" || material.kind === "past_paper";
// extracted Markdown can be stored as an uploaded .md file, so its type decides, not whether it has a file key
const isTextual = (material: StudyMaterial) =>
  !material.isFile ||
  /^text\//.test(material.mimeType ?? "") ||
  /\.(md|markdown|txt)$/i.test(material.title);

/** builds the cards for one module; syllabus and past papers belong to topics and exam history rather than the map */
export function moduleItems(
  snapshot: StudyMapSnapshot,
  board: StudyBoard,
): FlowItem[] {
  const { map } = snapshot;
  const topicIds = new Set(map.topics.map((topic) => topic.id));
  const materials = snapshot.materials.filter(
    (material) => !isReferenceMaterial(material),
  );
  const byId = new Map(
    materials.map((material) => [material.noteId, material]),
  );
  const textVersions = new Map<string, string>();
  for (const material of materials) {
    if (!isTextual(material)) continue;
    const original = material.references.find((reference) => {
      const target = byId.get(reference.id);
      return (
        reference.relation === "extraction" &&
        target !== undefined &&
        target.isFile &&
        !isTextual(target)
      );
    });
    if (original && !textVersions.has(original.id))
      textVersions.set(original.id, material.noteId);
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
      week:
        override !== undefined ? override || null : (inferred?.week ?? null),
      weekSource: override !== undefined ? "set" : (inferred?.source ?? null),
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
    const tags: FlowTag[] = mentionedTopics(
      `${assignment.title} ${plainText(assignment.description)}`,
      map.topics,
    ).map(({ topicId, count }) => ({
      topicId,
      relevance: "core",
      probability: null,
      suggested: false,
      mentioned: true,
      mentions: count,
    }));
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
    const attached = sources.filter(
      (item) =>
        assignment.noteIds.includes(item.id) ||
        assignment.noteIds.includes(item.textVersionId ?? ""),
    );
    const weeks = (attached.length ? attached : sources.slice(0, 3))
      .map((item) => item.week)
      .filter((week): week is number => week !== null);
    const linked = weeks.length ? Math.max(...weeks) : null;
    card.week =
      override !== undefined ? override || null : (titled?.week ?? linked);
    card.weekSource =
      override !== undefined
        ? "set"
        : titled
          ? "title"
          : linked !== null
            ? "linked"
            : null;
    items.push(card);
  }
  return items;
}

const coreTopics = (item: FlowItem) =>
  item.tags.filter((tag) => tag.relevance === "core").map((tag) => tag.topicId);

const weight = (tag: FlowTag) =>
  (tag.relevance === "core" ? 1 : 0.4) *
  (tag.suggested ? 0.7 : 1) *
  (tag.mentioned ? 0.8 : 1);

/** the topic a card is filed under: its heaviest tag, then the one its brief names most, then catalogue order */
export function primaryTopic(
  item: FlowItem,
  catalogue: Map<string, number>,
): string {
  let best: FlowTag | null = null;
  for (const tag of item.tags) {
    if (!catalogue.has(tag.topicId)) continue;
    if (
      !best ||
      weight(tag) > weight(best) ||
      (weight(tag) === weight(best) &&
        (tag.mentions > best.mentions ||
          (tag.mentions === best.mentions &&
            catalogue.get(tag.topicId)! < catalogue.get(best.topicId)!)))
    )
      best = tag;
  }
  return best?.topicId ?? UNSORTED;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** how strongly each pair of topics goes together: cards tagged with both, plus note links between cards filed under each */
export function topicRelations(
  topics: StudyTopic[],
  items: FlowItem[],
  links: FlowLink[] = [],
): TopicRelation[] {
  const catalogue = new Map(topics.map((topic, index) => [topic.id, index]));
  const totals = new Map<string, TopicRelation>();
  const add = (a: string, b: string, amount: number) => {
    if (a === b) return;
    const key = pairKey(a, b);
    const existing = totals.get(key);
    if (existing) existing.weight += amount;
    else
      totals.set(key, {
        a: a < b ? a : b,
        b: a < b ? b : a,
        weight: amount,
      });
  };
  for (const item of items) {
    const tags = item.tags.filter((tag) => catalogue.has(tag.topicId));
    for (const [index, left] of tags.entries())
      for (const right of tags.slice(index + 1))
        add(left.topicId, right.topicId, weight(left) * weight(right));
  }
  const primary = new Map(
    items.map((item) => [item.ref, primaryTopic(item, catalogue)]),
  );
  const linked = new Set<string>();
  for (const link of links) {
    const a = primary.get(link.source);
    const b = primary.get(link.target);
    const cards = pairKey(link.source, link.target);
    if (!a || !b || a === UNSORTED || b === UNSORTED || linked.has(cards))
      continue;
    linked.add(cards);
    add(a, b, 1);
  }
  return [...totals.values()].sort(
    (left, right) =>
      right.weight - left.weight ||
      catalogue.get(left.a)! - catalogue.get(right.a)! ||
      catalogue.get(left.b)! - catalogue.get(right.b)!,
  );
}

// one core tag beside one supporting tag; two supporting mentions alone do not earn an edge
const MIN_RELATION = 0.4;

/** strongest first, skipping any relation whose topics already have three, so a busy topic does not turn into a hairball */
function strongestRelations(
  relations: TopicRelation[],
  perTopic = 3,
): TopicRelation[] {
  const degree = new Map<string, number>();
  const kept: TopicRelation[] = [];
  for (const relation of relations) {
    if (
      relation.weight < MIN_RELATION ||
      (degree.get(relation.a) ?? 0) >= perTopic ||
      (degree.get(relation.b) ?? 0) >= perTopic
    )
      continue;
    kept.push(relation);
    degree.set(relation.a, (degree.get(relation.a) ?? 0) + 1);
    degree.set(relation.b, (degree.get(relation.b) ?? 0) + 1);
  }
  return kept;
}

/** keeps the syllabus hierarchy, then chains each sibling to the one most related to the topic before it */
export function orderTopics(
  topics: StudyTopic[],
  items: FlowItem[],
  links: FlowLink[] = [],
): StudyTopic[] {
  const ids = new Set(topics.map((topic) => topic.id));
  const strength = new Map(
    topicRelations(topics, items, links).map((relation) => [
      pairKey(relation.a, relation.b),
      relation.weight,
    ]),
  );
  const related = (left: string, right: string) =>
    strength.get(pairKey(left, right)) ?? 0;
  const children = (parentId: string | null) =>
    topics.filter((topic) =>
      parentId === null
        ? topic.parentId === null || !ids.has(topic.parentId)
        : topic.parentId === parentId,
    );
  const ordered: StudyTopic[] = [];
  const seen = new Set<string>();
  const walk = (siblings: StudyTopic[]) => {
    const rest = siblings.filter((topic) => !seen.has(topic.id));
    let previous: StudyTopic | null = null;
    while (rest.length) {
      let best = 0;
      if (previous) {
        const from = previous.id;
        rest.forEach((topic, index) => {
          if (related(from, topic.id) > related(from, rest[best].id))
            best = index;
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

const columnsFor = (count: number) =>
  count <= 1 ? 1 : count <= 4 ? 2 : count <= 15 ? 3 : 4;

/**
 * one framed cluster per topic, each card in the cluster of its primary topic. clusters follow orderTopics and
 * are packed left to right in shelves; a cluster that fits under the one before it, within the shelf's height
 * and width, stacks there instead, so neighbours in the order stay neighbours on the canvas
 */
export function layoutModule(
  mapId: string,
  topics: StudyTopic[],
  items: FlowItem[],
  placements: StudyBoard["placements"],
  links: FlowLink[] = [],
): ModuleLayout {
  const order = orderTopics(topics, items, links);
  const catalogue = new Map(topics.map((topic, index) => [topic.id, index]));
  const primary = new Map(
    items.map((item) => [item.ref, primaryTopic(item, catalogue)]),
  );
  const groups = new Map<string, FlowItem[]>(
    order.map((topic) => [topic.id, []]),
  );
  const unsorted: FlowItem[] = [];
  for (const item of items) {
    const key = primary.get(item.ref)!;
    (groups.get(key) ?? unsorted).push(item);
  }
  const entries: Array<{ key: string; topic: StudyTopic | null }> = [
    ...order.map((topic) => ({ key: topic.id, topic })),
    ...(unsorted.length || !order.length
      ? [{ key: UNSORTED, topic: null }]
      : []),
  ];
  groups.set(UNSORTED, unsorted);
  const reviewedCore = (item: FlowItem, key: string) =>
    item.tags.some(
      (tag) =>
        tag.topicId === key &&
        tag.relevance === "core" &&
        !tag.suggested &&
        !tag.mentioned,
    );
  const sized = entries.map(({ key, topic }) => {
    const cards = groups
      .get(key)!
      .slice()
      .sort(
        (left, right) =>
          Number(reviewedCore(right, key)) - Number(reviewedCore(left, key)) ||
          (left.week ?? 99) - (right.week ?? 99) ||
          left.title.localeCompare(right.title) ||
          left.ref.localeCompare(right.ref),
      );
    const columns = columnsFor(cards.length);
    const offsets: Array<{ x: number; y: number }> = [];
    let top = 0;
    for (let start = 0; start < cards.length; start += columns) {
      const row = cards.slice(start, start + columns);
      row.forEach((_, column) =>
        offsets.push({
          x: CLUSTER_PADDING + column * (CARD_WIDTH + CARD_GAP),
          y: CLUSTER_HEADER + top,
        }),
      );
      top += Math.max(...row.map((item) => item.height)) + CARD_GAP;
    }
    const body = cards.length ? top - CARD_GAP : EMPTY_BODY;
    return {
      key,
      topic,
      cards,
      offsets,
      width:
        columns * CARD_WIDTH + (columns - 1) * CARD_GAP + 2 * CLUSTER_PADDING,
      height: CLUSTER_HEADER + body + CLUSTER_PADDING,
    };
  });
  // aim for a canvas a little wider than tall, never narrower than its widest cluster
  const area = sized.reduce(
    (sum, entry) =>
      sum + (entry.width + CLUSTER_GAP) * (entry.height + SHELF_GAP),
    0,
  );
  const shelfWidth = Math.max(
    ...sized.map((entry) => entry.width),
    Math.min(3600, Math.max(1300, Math.sqrt(area * 1.8))),
  );
  const clusters: FlowCluster[] = [];
  const positions: ModuleLayout["positions"] = new Map();
  let shelfTop = CLUSTER_TOP;
  let shelfHeight = 0;
  let column = { x: 0, width: 0, bottom: CLUSTER_TOP };
  for (const entry of sized) {
    let x: number;
    let y: number;
    // nothing sits right of the newest column yet, so a wider cluster can stack under it too
    const fitsUnder =
      clusters.length > 0 &&
      column.x + entry.width <= shelfWidth &&
      column.bottom + SHELF_GAP / 2 + entry.height <= shelfTop + shelfHeight;
    if (fitsUnder) {
      x = column.x;
      y = column.bottom + SHELF_GAP / 2;
      column.width = Math.max(column.width, entry.width);
    } else {
      x = clusters.length ? column.x + column.width + CLUSTER_GAP : 0;
      if (x > 0 && x + entry.width > shelfWidth) {
        shelfTop += shelfHeight + SHELF_GAP;
        shelfHeight = 0;
        x = 0;
      }
      y = shelfTop;
      column = { x, width: entry.width, bottom: y };
    }
    column.bottom = y + entry.height;
    shelfHeight = Math.max(shelfHeight, column.bottom - shelfTop);
    clusters.push({
      key: entry.key,
      topic: entry.topic,
      x,
      y,
      width: entry.width,
      height: entry.height,
      refs: entry.cards.map((item) => item.ref),
    });
    entry.cards.forEach((item, index) =>
      positions.set(item.ref, {
        x: x + entry.offsets[index].x,
        y: y + entry.offsets[index].y,
        manual: false,
      }),
    );
  }
  for (const placement of placements) {
    if (positions.has(placement.id))
      positions.set(placement.id, {
        x: placement.x,
        y: placement.y,
        manual: true,
      });
  }
  const byRef = new Map(items.map((item) => [item.ref, item]));
  const right = Math.max(
    ...clusters.map((cluster) => cluster.x + cluster.width),
    ...[...positions].map(([, position]) => position.x + CARD_WIDTH),
  );
  const bottom = Math.max(
    ...clusters.map((cluster) => cluster.y + cluster.height),
    ...[...positions].map(
      ([ref, position]) => position.y + (byRef.get(ref)?.height ?? 0),
    ),
  );
  return {
    mapId,
    width: right + 48,
    height: bottom + 72,
    clusters,
    relations: strongestRelations(topicRelations(topics, items, links)),
    primary,
    positions,
  };
}

/** the notes that carry a topic as core, in teaching order */
export function topicTrail(
  topicId: string,
  items: FlowItem[],
  layout: ModuleLayout,
): FlowItem[] {
  return items
    .filter((item) =>
      item.tags.some(
        (tag) => tag.topicId === topicId && tag.relevance === "core",
      ),
    )
    .sort(
      (left, right) =>
        (left.week ?? 99) - (right.week ?? 99) ||
        (layout.positions.get(left.ref)?.y ?? 0) -
          (layout.positions.get(right.ref)?.y ?? 0) ||
        (layout.positions.get(left.ref)?.x ?? 0) -
          (layout.positions.get(right.ref)?.x ?? 0),
    );
}

/** notes an assignment draws on: its attached files first, then notes covering the topics it names */
export function assignmentSources(
  assignment: FlowItem,
  items: FlowItem[],
): FlowItem[] {
  const named = new Set(coreTopics(assignment));
  const attached = new Set(assignment.assignment?.noteIds ?? []);
  const score = (item: FlowItem) =>
    (attached.has(item.id) || attached.has(item.textVersionId ?? "") ? 10 : 0) +
    item.tags.filter(
      (tag) => tag.relevance === "core" && named.has(tag.topicId),
    ).length;
  return items
    .filter(
      (item) =>
        item.kind !== "assignment" &&
        item.mapId === assignment.mapId &&
        score(item) > 0,
    )
    .sort(
      (left, right) =>
        score(right) - score(left) || (left.week ?? 99) - (right.week ?? 99),
    )
    .slice(0, 8);
}

/** stored note references across every loaded module, plus labelled links drawn on each board */
export function flowLinks(
  modules: Array<{ items: FlowItem[]; board: StudyBoard }>,
): FlowLink[] {
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
      links.push({
        id: `note-${item.id}-${target.id}`,
        source: item.ref,
        target: target.ref,
        label: reference.relation === "attachment" ? "attaches" : "links to",
        origin: "note",
      });
    }
  }
  const refs = new Set(items.map((item) => item.ref));
  for (const { board } of modules) {
    for (const link of board.links) {
      if (refs.has(link.source) && refs.has(link.target))
        links.push({ ...link, origin: "yours" });
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
export function topicBridges(
  modules: Array<{ mapId: string; topics: StudyTopic[]; items: FlowItem[] }>,
  links: FlowLink[],
): TopicBridge[] {
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
          if ([b.name, ...b.aliases].some((name) => names.has(normal(name))))
            put(a.id, b.id, "same name");
        }
      }
    }
  }
  const byRef = new Map(
    modules.flatMap((module) =>
      module.items.map((item) => [item.ref, item] as const),
    ),
  );
  for (const link of links) {
    const source = byRef.get(link.source);
    const target = byRef.get(link.target);
    if (!source || !target || source.mapId === target.mapId) continue;
    for (const a of coreTopics(source))
      for (const b of coreTopics(target)) put(a, b, "linked notes");
  }
  return [...bridges.values()];
}
