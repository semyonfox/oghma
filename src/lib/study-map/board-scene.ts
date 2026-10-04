import { z } from "zod";

export const MAX_BOARD_SCENE_BYTES = 2_000_000;
export const MAX_BOARD_SCENE_ELEMENTS = 2_000;
export const MAX_BOARD_SCENE_POINTS = 20_000;

const elementId = z.string().min(1).max(128).regex(/^[A-Za-z0-9:_-]+$/);
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const point = z.tuple([coordinate, coordinate]);
const color = z.string().max(32).regex(/^(?:transparent|black|white|#[\da-f]{3}|#[\da-f]{4}|#[\da-f]{6}|#[\da-f]{8})$/i);
const nullableId = elementId.nullable();
const boundElement = z.object({ id: elementId, type: z.enum(["arrow", "text"]) }).strict();
const binding = z.object({
  elementId,
  focus: z.number().finite().min(-1).max(1),
  gap: coordinate,
  fixedPoint: z.tuple([z.number().finite().min(0).max(1), z.number().finite().min(0).max(1)]).optional(),
}).strict();
const arrowhead = z.enum([
  "arrow", "bar", "dot", "circle", "circle_outline", "triangle", "triangle_outline",
  "diamond", "diamond_outline", "crowfoot_one", "crowfoot_many", "crowfoot_one_or_many",
]).nullable();

export const sceneReferenceSchema = z.object({ kind: z.enum(["note", "topic"]), id: z.uuid() }).strict();
export type SceneReference = z.infer<typeof sceneReferenceSchema>;

const base = {
  id: elementId,
  x: coordinate,
  y: coordinate,
  width: z.number().finite().min(0).max(1_000_000),
  height: z.number().finite().min(0).max(1_000_000),
  angle: z.number().finite().min(-1_000).max(1_000),
  strokeColor: color,
  backgroundColor: color,
  fillStyle: z.enum(["hachure", "cross-hatch", "solid", "zigzag"]),
  strokeWidth: z.number().finite().min(0).max(100),
  strokeStyle: z.enum(["solid", "dashed", "dotted"]),
  roundness: z.object({ type: z.union([z.literal(1), z.literal(2), z.literal(3)]), value: z.number().finite().min(0).max(1_000).optional() }).strict().nullable(),
  roughness: z.number().finite().min(0).max(5),
  opacity: z.number().finite().min(0).max(100),
  seed: z.number().int().min(0).max(2_147_483_647),
  version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  versionNonce: z.number().int().min(0).max(2_147_483_647),
  index: z.string().min(1).max(128).regex(/^[A-Za-z0-9]+$/).nullable(),
  isDeleted: z.boolean(),
  groupIds: z.array(elementId).max(100),
  frameId: nullableId,
  boundElements: z.array(boundElement).max(MAX_BOARD_SCENE_ELEMENTS).nullable(),
  updated: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  link: z.string().min(1).max(2_000).nullable(),
  locked: z.boolean(),
  customData: z.undefined().optional(),
};

const linear = {
  ...base,
  points: z.array(point).min(1).max(MAX_BOARD_SCENE_POINTS),
  lastCommittedPoint: point.nullable(),
  startBinding: binding.nullable(),
  endBinding: binding.nullable(),
  startArrowhead: arrowhead,
  endArrowhead: arrowhead,
};

const rawElementSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("rectangle") }).strict(),
  z.object({ ...base, type: z.literal("diamond") }).strict(),
  z.object({ ...base, type: z.literal("ellipse") }).strict(),
  z.object({
    ...base,
    type: z.literal("text"),
    fontSize: z.number().finite().min(1).max(1_000),
    fontFamily: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(6), z.literal(7), z.literal(8)]),
    text: z.string().max(20_000),
    originalText: z.string().max(20_000),
    textAlign: z.enum(["left", "center", "right"]),
    verticalAlign: z.enum(["top", "middle", "bottom"]),
    containerId: nullableId,
    autoResize: z.boolean(),
    lineHeight: z.number().finite().min(0.1).max(10),
  }).strict(),
  z.object({ ...linear, type: z.literal("line") }).strict(),
  z.object({
    ...linear,
    type: z.literal("arrow"),
    elbowed: z.boolean(),
    fixedSegments: z.array(z.object({
      start: point,
      end: point,
      index: z.number().int().nonnegative().max(MAX_BOARD_SCENE_POINTS),
    }).strict()).max(MAX_BOARD_SCENE_POINTS).nullable().optional(),
    startIsSpecial: z.boolean().nullable().optional(),
    endIsSpecial: z.boolean().nullable().optional(),
  }).strict(),
  z.object({
    ...base,
    type: z.literal("freedraw"),
    points: z.array(point).min(1).max(MAX_BOARD_SCENE_POINTS),
    pressures: z.array(z.number().finite().min(0).max(1)).max(MAX_BOARD_SCENE_POINTS),
    simulatePressure: z.boolean(),
    lastCommittedPoint: point.nullable(),
  }).strict(),
  z.object({ ...base, type: z.literal("frame"), name: z.string().max(500).nullable() }).strict(),
  z.object({
    ...base,
    type: z.literal("embeddable"),
    customData: z.object({
      studyRef: sceneReferenceSchema,
    }).strict(),
  }).strict(),
]);

export type BoardSceneElement = z.infer<typeof rawElementSchema>;

function safeExternalLink(link: string): boolean {
  if (!/^https?:\/\//i.test(link) || /[\u0000-\u0020\u007f]/.test(link)) return false;
  try {
    const url = new URL(link);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch { return false; }
}

function matchingReferenceLink(element: Extract<BoardSceneElement, { type: "embeddable" }>): boolean {
  if (element.link === null) return true;
  const ref = element.customData.studyRef;
  if (ref.kind === "note") return element.link === `/notes/${ref.id}`;
  if (!element.link.startsWith("/study-map?")) return false;
  const url = new URL(element.link, "https://local.invalid");
  const entries = [...url.searchParams.entries()];
  return !url.hash && url.pathname === "/study-map" && url.searchParams.get("topic") === ref.id
    && entries.length >= 1 && entries.length <= 2
    && entries.every(([key, value]) => key === "topic" ? value === ref.id : key === "map" && z.uuid().safeParse(value).success)
    && new Set(entries.map(([key]) => key)).size === entries.length;
}

const elementSchema = rawElementSchema.superRefine((element, context) => {
  if (element.type === "embeddable" ? !matchingReferenceLink(element) : element.link !== null && !safeExternalLink(element.link)) {
    context.addIssue({ code: "custom", path: ["link"], message: "Use a matching study reference or an absolute HTTP or HTTPS link." });
  }
  if (element.type === "freedraw" && element.pressures.length !== 0 && element.pressures.length !== element.points.length) {
    context.addIssue({ code: "custom", path: ["pressures"], message: "Drawing pressure values must match its points." });
  }
});

export const boardSceneSchema = z.object({
  version: z.literal(1),
  elements: z.array(elementSchema).max(MAX_BOARD_SCENE_ELEMENTS),
  appState: z.object({
    scrollX: coordinate,
    scrollY: coordinate,
    zoom: z.object({ value: z.number().finite().min(0.1).max(30) }).strict(),
    viewBackgroundColor: color,
    gridSize: z.number().int().min(1).max(1_000).nullable().optional(),
  }).strict(),
}).strict().superRefine((scene, context) => {
  const ids = new Set<string>();
  let points = 0;
  let bindings = 0;
  for (const element of scene.elements) {
    if (ids.has(element.id)) context.addIssue({ code: "custom", path: ["elements"], message: "Drawing element IDs must be unique." });
    ids.add(element.id);
    if ("points" in element) points += element.points.length;
    if (element.type === "arrow") points += (element.fixedSegments?.length ?? 0) * 2;
    bindings += element.boundElements?.length ?? 0;
  }
  if (points > MAX_BOARD_SCENE_POINTS || bindings > MAX_BOARD_SCENE_POINTS) {
    context.addIssue({ code: "custom", path: ["elements"], message: "This drawing exceeds the 20,000-point or binding limit. Split it into separate maps." });
  }
  if (new TextEncoder().encode(JSON.stringify(scene)).byteLength > MAX_BOARD_SCENE_BYTES) {
    context.addIssue({ code: "custom", message: "This drawing exceeds the 2 MB save limit. Split it into separate maps." });
  }
});

export type StudyBoardScene = z.infer<typeof boardSceneSchema>;
export type BoardScene = StudyBoardScene;

export function getSceneReference(element: unknown): SceneReference | null {
  const result = z.object({
    type: z.literal("embeddable"),
    customData: z.object({ studyRef: sceneReferenceSchema }).strict(),
  }).safeParse(element);
  return result.success ? result.data.customData.studyRef : null;
}

export function pruneAvailableRefs(scene: StudyBoardScene, availableRefs: ReadonlySet<string>): StudyBoardScene {
  const retained = scene.elements.filter((element) => element.type !== "embeddable"
    || availableRefs.has(`${element.customData.studyRef.kind}:${element.customData.studyRef.id}`));
  const elementsById = new Map(retained.filter((element) => !element.isDeleted).map((element) => [element.id, element]));
  const textContainer = (target: BoardSceneElement | undefined): boolean => target?.type === "rectangle"
    || target?.type === "diamond" || target?.type === "ellipse" || target?.type === "arrow";
  const bindable = (target: BoardSceneElement | undefined): boolean => target?.type === "rectangle"
    || target?.type === "diamond" || target?.type === "ellipse" || target?.type === "text"
    || target?.type === "frame" || target?.type === "embeddable";
  const validFrame = (element: BoardSceneElement): string | null => {
    if (element.frameId === null) return null;
    const visited = new Set([element.id]);
    let current = elementsById.get(element.frameId);
    while (current) {
      if (current.type !== "frame" || visited.has(current.id)) return null;
      visited.add(current.id);
      if (current.frameId === null) return element.frameId;
      current = elementsById.get(current.frameId);
    }
    return null;
  };
  let changed = retained.length !== scene.elements.length;
  const elements = retained.map((element): BoardSceneElement => {
    const frameId = validFrame(element);
    const boundElements = element.boundElements?.filter((bound) => {
      if (element.isDeleted || bound.id === element.id) return false;
      const target = elementsById.get(bound.id);
      if (bound.type === "text") return textContainer(element) && target?.type === "text" && target.containerId === element.id;
      return bindable(element) && target?.type === "arrow"
        && (target.startBinding?.elementId === element.id || target.endBinding?.elementId === element.id);
    }) ?? null;
    let next = element;
    if (frameId !== element.frameId || boundElements?.length !== element.boundElements?.length) next = { ...next, frameId, boundElements };
    if (next.type === "text" && next.containerId !== null && (next.containerId === next.id || !textContainer(elementsById.get(next.containerId)))) next = { ...next, containerId: null };
    if (next.type === "arrow" || next.type === "line") {
      const startBinding = next.startBinding && next.startBinding.elementId !== next.id && bindable(elementsById.get(next.startBinding.elementId)) ? next.startBinding : null;
      const endBinding = next.endBinding && next.endBinding.elementId !== next.id && bindable(elementsById.get(next.endBinding.elementId)) ? next.endBinding : null;
      if (startBinding !== next.startBinding || endBinding !== next.endBinding) next = { ...next, startBinding, endBinding };
    }
    if (next !== element) changed = true;
    return next;
  });
  return changed ? { ...scene, elements } : scene;
}

export function sanitizeBoardScene(input: unknown): StudyBoardScene {
  const scene = boardSceneSchema.parse(input);
  const refs = new Set(scene.elements.flatMap((element) => element.type === "embeddable"
    ? [`${element.customData.studyRef.kind}:${element.customData.studyRef.id}`] : []));
  return pruneAvailableRefs(scene, refs);
}
