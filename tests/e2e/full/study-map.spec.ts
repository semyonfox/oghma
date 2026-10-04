import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { createNoteViaApi, expect, test as fixtureTest } from "../fixtures";
import { tinyPdf } from "../../../scripts/dev/seed-study-map";
import {
  boardSchema,
  examStructureSchema,
  materialOverridesSchema,
  topicAssociationSchema,
  topicSchema,
  type DocumentKind,
} from "../../../src/lib/study-map/types";

type OwnedRecords = { maps: string[]; notes: string[] };
const mapResponseSchema = z.object({ mapId: z.uuid() });
const snapshotSchema = z.object({
  map: z.object({
    id: z.uuid(),
    version: z.number(),
    taxonomyVersion: z.number(),
    boardVersion: z.number(),
    topics: topicSchema.array(),
    board: boardSchema,
  }),
  materials: z
    .object({
      noteId: z.uuid(),
      title: z.string(),
      currentHash: z.string(),
      sourceHash: z.string(),
      status: z.enum(["unclassified", "classified", "stale", "failed"]),
      labels: z.string().array(),
      overrides: materialOverridesSchema,
      associations: topicAssociationSchema.array(),
    })
    .array(),
  papers: z
    .object({
      noteId: z.uuid(),
      reviewed: z.boolean(),
      structure: examStructureSchema,
    })
    .array(),
  jobs: z
    .object({
      kind: z.string(),
      state: z.string(),
      error: z.string().nullable(),
    })
    .array(),
});

const test = fixtureTest.extend<{
  owned: OwnedRecords;
  browserErrors: string[];
}>({
  owned: async ({ loggedInPage: page }, fixtureUse) => {
    const owned: OwnedRecords = { maps: [], notes: [] };
    try {
      await fixtureUse(owned);
    } finally {
      for (const id of [...owned.maps].reverse()) {
        const response = await page.request.delete(`/api/study-maps/${id}`, {
          headers: origin(page),
        });
        expect(response.ok(), `cleanup of owned map ${id}`).toBe(true);
      }
      for (const id of [...owned.notes].reverse()) {
        const response = await page.request.delete(`/api/notes/${id}`, {
          headers: origin(page),
        });
        expect(response.ok(), `cleanup of owned note ${id}`).toBe(true);
      }
    }
  },
  browserErrors: async ({ loggedInPage: page }, fixtureUse) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await fixtureUse(errors);
    expect(errors, "browser runtime and console errors").toEqual([]);
  },
});

test.setTimeout(120_000);

function origin(page: Page) {
  return { origin: new URL(page.url()).origin };
}

async function readSnapshot(page: Page, mapId: string) {
  const response = await page.request.get(`/api/study-maps/${mapId}`);
  expect(response.ok(), `load map ${mapId}: ${response.status()}`).toBe(true);
  const body: unknown = await response.json();
  return snapshotSchema.parse(body);
}

async function createNote(
  page: Page,
  owned: OwnedRecords,
  title: string,
  content: string,
) {
  const note = await createNoteViaApi(page, title, content);
  owned.notes.push(note.id);
  return note;
}

async function createMap(page: Page, owned: OwnedRecords, name: string) {
  const response = await page.request.post("/api/study-maps", {
    headers: origin(page),
    data: { name, academicYear: "2025/26" },
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  const { mapId } = mapResponseSchema.parse(body);
  owned.maps.push(mapId);
  return mapId;
}

async function uploadNote(page: Page, owned: OwnedRecords, name: string, mimeType: string, buffer: Buffer) {
  const response = await page.request.post("/api/upload", {
    headers: origin(page),
    multipart: { file: { name, mimeType, buffer } },
  });
  expect(response.status()).toBe(200);
  const note = z.object({ noteId: z.uuid(), fileName: z.string(), createdNewNote: z.literal(true) }).parse(await response.json());
  owned.notes.push(note.noteId);
  return { id: note.noteId, title: note.fileName };
}

async function addMaterials(page: Page, mapId: string, noteIds: string[]) {
  const response = await page.request.post(
    `/api/study-maps/${mapId}/materials`,
    { headers: origin(page), data: { noteIds } },
  );
  expect(response.ok()).toBe(true);
}

async function addReviewedTopics(page: Page, mapId: string, names: string[]) {
  const current = await readSnapshot(page, mapId);
  const topics = names.map((name) => ({
    id: randomUUID(),
    name,
    definition: `${name} describes the module's ${name.toLowerCase()} concepts and examples.`,
    includes: "",
    excludes: "",
    aliases: [],
    parentId: null,
    sources: [],
    reviewed: true,
  }));
  const response = await page.request.put(`/api/study-maps/${mapId}/topics`, {
    headers: origin(page),
    data: { version: current.map.version, topics },
  });
  expect(response.ok()).toBe(true);
  return topics;
}

async function reviewMaterial(
  page: Page,
  mapId: string,
  noteId: string,
  topics: Record<string, "core" | "supporting" | "excluded">,
  labels: string[],
  kind: DocumentKind = "notes",
) {
  const current = await readSnapshot(page, mapId);
  const material = current.materials.find((entry) => entry.noteId === noteId);
  if (!material)
    throw new Error(`Own test note ${noteId} is missing from its map`);
  const response = await page.request.patch(
    `/api/study-maps/${mapId}/materials`,
    {
      headers: origin(page),
      data: {
        noteId,
        sourceHash: material.currentHash,
        taxonomyVersion: current.map.taxonomyVersion,
        kind,
        labels,
        topics,
      },
    },
  );
  expect(response.ok(), `review own material: ${response.status()}`).toBe(true);
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
}

function canvasCard(page: Page, noteId: string) {
  return page.locator(`[data-study-reference="note:${noteId}"]`);
}

async function expectCardStaysInView(page: Page, noteId: string) {
  await expect(canvasCard(page, noteId)).toBeInViewport({ ratio: 0.99 });
  const stayedVisible = await page.evaluate(async (selector) => {
    const started = performance.now();
    while (performance.now() - started < 750) {
      const card = document.querySelector(selector);
      const canvas = document.querySelector("canvas.excalidraw__canvas.interactive");
      if (!card || !canvas) return false;
      const box = card.getBoundingClientRect();
      const viewport = canvas.getBoundingClientRect();
      const width = Math.max(0, Math.min(box.right, viewport.right) - Math.max(box.left, viewport.left));
      const height = Math.max(0, Math.min(box.bottom, viewport.bottom) - Math.max(box.top, viewport.top));
      if (!box.width || !box.height || width * height / (box.width * box.height) < 0.99) return false;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return true;
  }, `[data-study-reference="note:${noteId}"]`);
  expect(stayedVisible, "the source card remains inside the canvas for 750ms").toBe(true);
}

async function cardPosition(card: Locator) {
  const box = await card.boundingBox();
  if (!box) throw new Error("The live study card is not visible");
  return { x: box.x, y: box.y };
}

async function readDraftBoard(page: Page, mapId: string) {
  const stored = await page.evaluate((key) => sessionStorage.getItem(key), `oghma-study-map-draft:${mapId}`);
  if (!stored) throw new Error("The board has no local drawing draft");
  return z.object({ board: boardSchema }).parse(JSON.parse(stored)).board;
}

async function draftCardPosition(page: Page, mapId: string, noteId: string) {
  const board = await readDraftBoard(page, mapId);
  const element = board.scene?.elements.find((entry) => !entry.isDeleted && entry.type === "embeddable" && entry.customData.studyRef.kind === "note" && entry.customData.studyRef.id === noteId);
  if (!element) throw new Error(`The local drawing draft is missing note ${noteId}`);
  return { x: element.x, y: element.y };
}

function savedScene(snapshot: Awaited<ReturnType<typeof readSnapshot>>) {
  const scene = snapshot.map.board.scene;
  if (!scene) throw new Error("The board has no saved drawing scene");
  return scene;
}

function sceneCard(snapshot: Awaited<ReturnType<typeof readSnapshot>>, noteId: string) {
  const element = savedScene(snapshot).elements.find((entry) => !entry.isDeleted && entry.type === "embeddable" && entry.customData.studyRef.kind === "note" && entry.customData.studyRef.id === noteId);
  if (!element) throw new Error(`The saved board is missing note ${noteId}`);
  return element;
}

async function selectBoardCard(page: Page, title: string) {
  const board = page.getByRole("region", { name: "Study map canvas", exact: true });
  await board.getByRole("button", { name: "Add to board", exact: true }).click();
  const tray = board.getByRole("complementary", { name: "Add study references to board", exact: true });
  await tray.getByRole("searchbox", { name: "Search materials and topics", exact: true }).fill(title);
  await tray.locator("li").filter({ hasText: title }).getByRole("button", { name: "Find on board", exact: true }).click();
  await expect(tray).toHaveCount(0);
  await expect(board.getByRole("group", { name: "Board selection", exact: true })).toContainText(title);
}

async function dragBoardCard(page: Page, noteId: string, dx: number) {
  const card = canvasCard(page, noteId);
  await expect(card).toBeInViewport();
  const box = await card.boundingBox();
  if (!box) throw new Error("The live study card is not visible");
  const x = box.x + box.width / 2;
  const y = box.y + 30;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 12 });
  await page.mouse.up();
}

async function saveLayout(page: Page, mapId: string) {
  const saving = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/study-maps/${mapId}/board` && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  expect((await saving).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Save layout", exact: true })).toBeDisabled();
  return readSnapshot(page, mapId);
}

async function addBoardLink(page: Page, source: string, target: string, label: string) {
  const board = page.getByRole("region", { name: "Study map canvas", exact: true });
  await board.getByRole("button", { name: "Add link", exact: true }).filter({ hasText: /^Add link$/ }).click();
  await board.getByRole("combobox", { name: "From", exact: true }).selectOption({ label: source });
  await board.getByRole("combobox", { name: "To", exact: true }).selectOption({ label: target });
  await board.getByRole("textbox", { name: "Relationship", exact: true }).fill(label);
  await board.getByRole("button", { name: "Save link", exact: true }).click();
  await expect(board.getByRole("textbox", { name: "Relationship", exact: true })).toHaveCount(0);
}

test("a student creates a map, chooses a syllabus, approves topics and classifies a library note", async ({
  loggedInPage: page,
  owned,
  browserErrors,
}, testInfo) => {
  const suffix = randomUUID().slice(0, 8);
  const name = `Workflow algorithms ${suffix}`;
  const syllabus = await createNote(
    page,
    owned,
    `Workflow syllabus ${suffix}`,
    "## Graphs\n\nGraphs represent vertices and edges. Graph traversal visits reachable vertices with a frontier.\n\n## Complexity\n\nComplexity describes the time and space used by algorithms as the input grows.",
  );
  const lecture = await createNote(
    page,
    owned,
    `Workflow graph lecture ${suffix}`,
    "Graphs represent vertices and edges. Graph traversal visits reachable vertices with a frontier. Breadth first search stores vertices in a queue. Complexity describes the time and space used by algorithms as the input grows.",
  );

  await page.goto("/study-map");
  await page.getByRole("button", { name: "New module", exact: true }).click();
  await page.getByLabel("Module name", { exact: true }).fill(name);
  await page.getByLabel("Academic year", { exact: true }).fill("2025/26");
  await page.getByRole("button", { name: "Choose note", exact: true }).click();
  await page
    .getByLabel("Search notes by title", { exact: true })
    .fill(syllabus.title);
  await page.getByRole("button", { name: syllabus.title, exact: true }).click();
  const created = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/study-maps" &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Create module map", exact: true })
    .click();
  const createResponse = await created;
  expect(createResponse.status()).toBe(201);
  const body: unknown = await createResponse.json();
  const { mapId } = mapResponseSchema.parse(body);
  owned.maps.push(mapId);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "Add materials", exact: true })
    .click();
  await page
    .getByLabel("Search library by title", { exact: true })
    .fill(lecture.title);
  await page
    .getByRole("checkbox", { name: lecture.title, exact: true })
    .check();
  await page
    .getByRole("button", { name: "Add 1 material", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await readSnapshot(page, mapId)).materials.map((entry) => entry.noteId),
    )
    .toContain(lecture.id);
  await expect(
    page.getByRole("button", { name: "Classify materials", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Propose syllabus topics", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await readSnapshot(page, mapId)).map.topics
          .map((entry) => entry.name)
          .sort(),
      { timeout: 45_000 },
    )
    .toEqual(["Complexity", "Graphs"]);
  const definitionsSummary = page.locator("summary").filter({ hasText: /^Review topic definitions/ });
  await expect(definitionsSummary).toBeAttached();
  if (!(await definitionsSummary.isVisible())) {
    await page.locator("summary").filter({ hasText: /^Topics and classification/ }).click();
  }
  const definitions = definitionsSummary.locator("..");
  await definitionsSummary.click();
  for (const topicName of ["Graphs", "Complexity"]) {
    await definitions
      .getByRole("button", { name: new RegExp(`^${topicName}`) })
      .click();
    await expect(
      page.getByRole("heading", { name: "Definition sources", exact: true }),
    ).toBeVisible();
    await page.getByRole("checkbox", { name: /^Approve topic/ }).check();
    await page.getByRole("button", { name: "Save topic", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await readSnapshot(page, mapId)).map.topics.find(
            (entry) => entry.name === topicName,
          )?.reviewed,
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Close inspector", exact: true })
      .click();
  }
  await expect(
    page.getByRole("button", { name: "Classify materials", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Classify materials", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await readSnapshot(page, mapId)).materials.find(
          (entry) => entry.noteId === lecture.id,
        )?.status,
      { timeout: 45_000 },
    )
    .toBe("classified");
  const classified = (await readSnapshot(page, mapId)).materials.find(
    (entry) => entry.noteId === lecture.id,
  );
  expect(
    classified?.associations.some(
      (entry) => entry.status === "suggested" && entry.evidence.length > 0,
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "Materials", exact: true }).click();
  const lectureCard = page.getByRole("button", {
    name: new RegExp(lecture.title),
  });
  await expect(lectureCard).toBeVisible();
  await expect(lectureCard).toContainText("Suggestions to review");
  await lectureCard.scrollIntoViewIfNeeded();
  await expectNoPageOverflow(page);
  await screenshot(page, testInfo, "desktop-classified-materials");
  expect(browserErrors).toEqual([]);
});

test("drawing drafts survive original-note visits and reload before pins, stickies and connectors are saved", async ({ loggedInPage: page, owned, browserErrors }, testInfo) => {
  const suffix = randomUUID().slice(0, 8);
  const name = `Canvas algorithms ${suffix}`;
  const mapId = await createMap(page, owned, name);
  const topics = await addReviewedTopics(page, mapId, ["Graphs", "Complexity"]);
  const first = await createNote(page, owned, `Canvas graph note ${suffix}`, "Graphs and Complexity describe graph traversal and its runtime.");
  const second = await createNote(page, owned, `Canvas runtime note ${suffix}`, "Complexity compares growth in the runtime of algorithms.");
  await addMaterials(page, mapId, [first.id, second.id]);
  await reviewMaterial(page, mapId, first.id, { [topics[0].id]: "core", [topics[1].id]: "supporting" }, ["revision"]);
  await reviewMaterial(page, mapId, second.id, { [topics[1].id]: "core" }, []);
  await page.goto(`/study-map?map=${mapId}`);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const board = page.getByRole("region", { name: "Study map canvas", exact: true });
  await expect(board.locator("canvas.excalidraw__canvas.interactive")).toBeVisible();
  await page.getByRole("button", { name: "Focus board", exact: true }).click();
  const freshCard = canvasCard(page, first.id);
  await freshCard.getByRole("button", { name: `Inspect ${first.title}`, exact: true }).click({ timeout: 15_000 });
  const directInspector = page.getByRole("complementary", { name: "Selected material or topic", exact: true });
  await expect(directInspector.getByRole("heading", { name: first.title, exact: true })).toBeVisible();
  await directInspector.getByRole("button", { name: "Close inspector", exact: true }).click();
  await freshCard.getByRole("button", { name: "Show Graphs, accepted core topic", exact: true }).click({ timeout: 15_000 });
  await expect(directInspector.getByRole("heading", { name: "Graphs", exact: true })).toBeVisible();
  await directInspector.getByRole("button", { name: "Close inspector", exact: true }).click();
  await freshCard.getByRole("link", { name: "Open original", exact: true }).click({ timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(`/notes/${first.id}$`));
  await page.goBack();
  await expect(board.locator("canvas.excalidraw__canvas.interactive")).toBeVisible();
  const baseline = await saveLayout(page, mapId);
  await selectBoardCard(page, first.title);
  const strokeControl = board.locator(".selected-shape-actions").getByRole("button", { name: "Stroke", exact: true });
  await expect(strokeControl).not.toBeVisible();
  const before = await cardPosition(canvasCard(page, first.id));
  await dragBoardCard(page, first.id, 72);
  await expect.poll(async () => (await cardPosition(canvasCard(page, first.id))).x).toBeGreaterThan(before.x + 40);
  await board.getByRole("group", { name: "Board selection", exact: true }).getByRole("button", { name: "Pin selection", exact: true }).click();
  await expect(board.getByRole("button", { name: "Unpin selection", exact: true })).toBeVisible();
  await board.getByRole("button", { name: "Sticky note", exact: true }).click();
  await expect(strokeControl).toBeVisible();
  await addBoardLink(page, first.title, second.title, "supports analysis");
  await selectBoardCard(page, first.title);
  const draftPosition = await draftCardPosition(page, mapId, first.id);
  await expect(page.getByText("Unsaved layout", { exact: true })).toBeVisible();
  expect((await readSnapshot(page, mapId)).map.board).toEqual(baseline.map.board);
  await board.getByRole("group", { name: "Board selection", exact: true }).getByRole("link", { name: "Open original", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/notes/${first.id}$`));
  for (const navigation of ["back", "reload"] as const) {
    if (navigation === "back") await page.goBack();
    else await page.reload();
    await expect(page.getByRole("tab", { name: "Canvas", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Unsaved layout", { exact: true })).toBeVisible();
    await selectBoardCard(page, first.title);
    await expect(board.getByRole("button", { name: "Unpin selection", exact: true })).toBeVisible();
    expect(await draftCardPosition(page, mapId, first.id)).toEqual(draftPosition);
    await expect(canvasCard(page, first.id)).toHaveCount(1);
    expect((await readSnapshot(page, mapId)).map.board).toEqual(baseline.map.board);
  }
  await screenshot(page, testInfo, "desktop-restored-unsaved-drawing");
  const saved = await saveLayout(page, mapId);
  const firstElement = sceneCard(saved, first.id);
  const secondElement = sceneCard(saved, second.id);
  expect(firstElement).toMatchObject({ locked: true });
  expect(firstElement.x).toBeGreaterThan(sceneCard(baseline, first.id).x + 40);
  const scene = savedScene(saved);
  expect(scene.elements.some((entry) => !entry.isDeleted && entry.type === "text" && entry.text === "Your idea")).toBe(true);
  const connector = scene.elements.find((entry) => !entry.isDeleted && entry.type === "arrow");
  expect(connector).toMatchObject({ startBinding: { elementId: firstElement.id }, endBinding: { elementId: secondElement.id } });
  expect(scene.elements.some((entry) => !entry.isDeleted && entry.type === "text" && entry.text === "supports analysis" && entry.containerId === connector?.id)).toBe(true);
  await page.reload();
  await selectBoardCard(page, first.title);
  await expect(board.getByRole("button", { name: "Unpin selection", exact: true })).toBeVisible();
  expect(sceneCard(await readSnapshot(page, mapId), first.id)).toMatchObject({ x: firstElement.x, y: firstElement.y, locked: true });
  if (await page.getByRole("button", { name: "Save layout", exact: true }).isEnabled()) {
    await saveLayout(page, mapId);
  }
  await expectNoPageOverflow(page);
  await screenshot(page, testInfo, "desktop-saved-drawing");
  await board.getByRole("group", { name: "Board selection", exact: true }).getByRole("link", { name: "Open original", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/notes/${first.id}$`));
  const labels = page.getByRole("region", { name: "Note study labels", exact: true });
  await expect(labels.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(labels.getByRole("link", { name: "Graphs, core, accepted", exact: true })).toBeVisible();
  await expect(labels.getByRole("link", { name: "Complexity, supporting, accepted", exact: true })).toBeVisible();
  await expect(labels.getByText("revision · your label", { exact: true })).toBeVisible();
  const original = await page.request.get(`/api/notes/${first.id}`);
  expect(z.object({ content: z.string() }).parse(await original.json()).content).toBe(first.content);
  expect(browserErrors).toEqual([]);
});

test("native frames and arrows persist, and conflicting drawing drafts keep the saved version", async ({ loggedInPage: page, owned, browserErrors }) => {
  const mapId = await createMap(page, owned, `Native drawing ${randomUUID().slice(0, 8)}`);
  await page.goto(`/study-map?map=${mapId}`);
  await page.getByRole("button", { name: "Focus board", exact: true }).click();
  const board = page.getByRole("region", { name: "Study map canvas", exact: true });
  const canvas = board.locator("canvas.excalidraw__canvas.interactive");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("The drawing canvas is unavailable");
  await board.getByRole("button", { name: "Frame", exact: true }).click();
  await page.mouse.move(box.x + 340, box.y + 180);
  await page.mouse.down();
  await page.mouse.move(box.x + 640, box.y + 390, { steps: 12 });
  await page.mouse.up();
  await board.getByRole("button", { name: "Connect", exact: true }).click();
  await page.mouse.move(box.x + 740, box.y + 220);
  await page.mouse.down();
  await page.mouse.move(box.x + 960, box.y + 350, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  const initial = await saveLayout(page, mapId);
  expect(savedScene(initial).elements.some((entry) => !entry.isDeleted && entry.type === "frame")).toBe(true);
  expect(savedScene(initial).elements.some((entry) => !entry.isDeleted && entry.type === "arrow")).toBe(true);
  await board.getByRole("button", { name: "Sticky note", exact: true }).click();
  const other = await page.context().newPage();
  other.on("pageerror", (error) => browserErrors.push(error.message));
  other.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  let remote: Awaited<ReturnType<typeof readSnapshot>>;
  try {
    await other.goto(`/study-map?map=${mapId}`);
    await other.getByRole("region", { name: "Study map canvas", exact: true }).getByRole("button", { name: "Sticky note", exact: true }).click();
    remote = await saveLayout(other, mapId);
    expect(remote.map.boardVersion).toBe(initial.map.boardVersion + 1);
  } finally {
    await other.close();
  }
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "The layout changed in another tab" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save layout", exact: true })).toBeDisabled();
  expect((await readSnapshot(page, mapId)).map.board).toEqual(remote.map.board);
  await page.getByRole("button", { name: "Reload saved layout", exact: true }).click();
  await expect(page.getByText("Discard your unsaved layout and load the saved version?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Discard and reload", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The layout changed in another tab" })).toHaveCount(0);
  expect(savedScene(await readSnapshot(page, mapId)).elements).toEqual(savedScene(remote).elements);
  expect(browserErrors).toEqual([]);
});

test("removing drawing references keeps originals, while removing a material prunes cards and connector bindings", async ({ loggedInPage: page, owned, browserErrors }) => {
  const suffix = randomUUID().slice(0, 8);
  const mapId = await createMap(page, owned, `Reference removal ${suffix}`);
  const first = await createNote(page, owned, `Reference first ${suffix}`, "First original content.");
  const second = await createNote(page, owned, `Reference second ${suffix}`, "Second original content.");
  await addMaterials(page, mapId, [first.id, second.id]);
  await page.goto(`/study-map?map=${mapId}`);
  const board = page.getByRole("region", { name: "Study map canvas", exact: true });
  await selectBoardCard(page, first.title);
  await addBoardLink(page, first.title, second.title, "references");
  const original = await saveLayout(page, mapId);
  const firstElement = sceneCard(original, first.id);
  await selectBoardCard(page, first.title);
  await board.getByRole("group", { name: "Board selection", exact: true }).getByRole("button", { name: "Remove from board", exact: true }).click();
  const removed = await saveLayout(page, mapId);
  expect(savedScene(removed).elements.some((entry) => !entry.isDeleted && entry.id === firstElement.id)).toBe(false);
  expect(removed.materials.some((entry) => entry.noteId === first.id)).toBe(true);
  await board.getByRole("button", { name: "Add to board", exact: true }).click();
  const tray = board.getByRole("complementary", { name: "Add study references to board", exact: true });
  await tray.getByRole("searchbox", { name: "Search materials and topics", exact: true }).fill(first.title);
  await tray.locator("li").filter({ hasText: first.title }).getByRole("button", { name: "Add to board", exact: true }).click();
  await expect(tray).toHaveCount(0);
  const restored = await saveLayout(page, mapId);
  const restoredElement = sceneCard(restored, first.id);
  expect(restoredElement.id).not.toBe(firstElement.id);
  await selectBoardCard(page, first.title);
  await board.getByRole("group", { name: "Board selection", exact: true }).getByRole("button", { name: /^Inspect(?: reference)?$/ }).click();
  const inspector = page.getByRole("complementary", { name: "Selected material or topic", exact: true });
  await inspector.getByRole("button", { name: "Remove from map", exact: true }).click();
  await inspector.getByRole("button", { name: "Confirm removal", exact: true }).click();
  await expect.poll(async () => (await readSnapshot(page, mapId)).materials.some((entry) => entry.noteId === first.id)).toBe(false);
  const pruned = savedScene(await readSnapshot(page, mapId));
  expect(pruned.elements.some((entry) => entry.type === "embeddable" && entry.customData.studyRef.id === first.id)).toBe(false);
  expect(pruned.elements.filter((entry) => entry.type === "arrow").every((entry) => entry.startBinding?.elementId !== firstElement.id && entry.endBinding?.elementId !== firstElement.id && entry.startBinding?.elementId !== restoredElement.id && entry.endBinding?.elementId !== restoredElement.id)).toBe(true);
  const note = await page.request.get(`/api/notes/${first.id}`);
  expect(note.ok()).toBe(true);
  expect(z.object({ content: z.string() }).parse(await note.json()).content).toBe(first.content);
  expect(browserErrors).toEqual([]);
});

test("a remounted board adds new materials and shows changed source content without moving saved cards", async ({ loggedInPage: page, owned, browserErrors }) => {
  const suffix = randomUUID().slice(0, 8);
  const mapId = await createMap(page, owned, `Source sync ${suffix}`);
  const first = await createNote(page, owned, `Source graph ${suffix}`, "Graphs describe the connections between vertices.");
  const second = await createNote(page, owned, `Source runtime ${suffix}`, "Runtime describes how the number of operations grows.");
  await addMaterials(page, mapId, [first.id]);
  await page.goto(`/study-map?map=${mapId}`);
  const board = page.getByRole("region", { name: "Study map canvas", exact: true });
  await expect(board.locator("canvas.excalidraw__canvas.interactive")).toBeVisible();
  const initial = await saveLayout(page, mapId);
  const firstElement = sceneCard(initial, first.id);
  await page.getByRole("button", { name: "Reload saved layout", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save layout", exact: true })).toBeDisabled();
  await expect(board.getByRole("button", { name: "Add to board", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Add materials", exact: true }).click();
  await page.getByLabel("Search library by title", { exact: true }).fill(second.title);
  await page.getByRole("checkbox", { name: second.title, exact: true }).check();
  await page.getByRole("button", { name: "Add 1 material", exact: true }).click();
  await selectBoardCard(page, second.title);
  await expect(canvasCard(page, second.id)).toContainText(second.content);
  const imported = await saveLayout(page, mapId);
  expect(sceneCard(imported, first.id)).toMatchObject({ id: firstElement.id, x: firstElement.x, y: firstElement.y });
  expect(savedScene(imported).elements.filter((entry) => !entry.isDeleted && entry.type === "embeddable" && entry.customData.studyRef.id === second.id)).toHaveLength(1);
  const title = `Updated graph ${suffix}`;
  const content = "A graph now describes a revised set of vertices and their connections.";
  const updated = await page.request.put(`/api/notes/${first.id}`, { headers: origin(page), data: { title, content } });
  expect(updated.ok()).toBe(true);
  await page.goto(`/notes/${first.id}`);
  await page.goBack();
  await selectBoardCard(page, title);
  await expect(canvasCard(page, first.id)).toContainText(title);
  await expect(canvasCard(page, first.id)).toContainText(content);
  expect(sceneCard(await readSnapshot(page, mapId), first.id)).toMatchObject({ id: firstElement.id, x: firstElement.x, y: firstElement.y });
  expect(browserErrors).toEqual([]);
});

test("finding offscreen file cards keeps their camera position and renders uploaded previews", async ({ loggedInPage: page, owned, browserErrors }, testInfo) => {
  const suffix = randomUUID().slice(0, 8);
  const mapId = await createMap(page, owned, `File previews ${suffix}`);
  const fillers = [];
  for (let index = 0; index < 10; index++) {
    fillers.push(await createNote(page, owned, `A preview filler ${index} ${suffix}`, "A separate reference on the study board."));
  }
  const pdf = await uploadNote(page, owned, `zz-preview-${suffix}.pdf`, "application/pdf", tinyPdf("[Page 1]\nGraphs and their connections.\n[Page 2]\nRuntime and complexity."));
  const image = await uploadNote(page, owned, `zz-preview-${suffix}.png`, "image/png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  await addMaterials(page, mapId, [...fillers.map((entry) => entry.id), pdf.id, image.id]);
  await page.goto(`/study-map?map=${mapId}`);
  await page.getByRole("button", { name: "Focus board", exact: true }).click();
  const board = page.getByRole("region", { name: "Study map canvas", exact: true });
  await expect(board.getByRole("button", { name: "Add to board", exact: true })).toBeEnabled();
  await expect(canvasCard(page, pdf.id)).not.toBeInViewport();
  await board.getByRole("button", { name: "Sticky note", exact: true }).click();
  const sticky = (await readDraftBoard(page, mapId)).scene?.elements.find((entry) => !entry.isDeleted && entry.type === "text" && entry.text === "Your idea");
  if (!sticky) throw new Error("The unsaved sticky note was not added");
  await selectBoardCard(page, pdf.title);
  await expectCardStaysInView(page, pdf.id);
  const renderedPdf = canvasCard(page, pdf.id).locator("canvas.react-pdf__Page__canvas");
  await expect(renderedPdf).toBeVisible();
  expect(await renderedPdf.evaluate((canvas) => canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0)).toBe(true);
  await expectCardStaysInView(page, pdf.id);
  expect((await readDraftBoard(page, mapId)).scene?.elements).toEqual(expect.arrayContaining([expect.objectContaining({ id: sticky.id, type: "text", text: "Your idea", isDeleted: false })]));
  const saved = await saveLayout(page, mapId);
  expect(savedScene(saved).elements).toEqual(expect.arrayContaining([expect.objectContaining({ id: sticky.id, type: "text", text: "Your idea", isDeleted: false })]));
  await screenshot(page, testInfo, "desktop-live-pdf-preview");
  await selectBoardCard(page, image.title);
  await expectCardStaysInView(page, image.id);
  const renderedImage = canvasCard(page, image.id).getByRole("img", { name: `Preview of ${image.title}`, exact: true });
  await expect.poll(() => renderedImage.evaluate((element) => element instanceof HTMLImageElement ? element.naturalWidth : 0)).toBeGreaterThan(0);
  await expectCardStaysInView(page, image.id);
  expect(browserErrors).toEqual([]);
});

test("finding a seeded SVG card keeps its preview visible", async ({ loggedInPage: page, owned, browserErrors }, testInfo) => {
  const noteId = "71000000-0000-4000-8000-000000000032";
  const response = await page.request.get(`/api/notes/${noteId}`);
  test.skip(response.status() === 404, "process-states.svg is available only in the synthetic study-map preview seed");
  expect(response.ok()).toBe(true);
  const note = z.object({ id: z.uuid(), title: z.string(), mimeType: z.literal("image/svg+xml") }).parse(await response.json());
  const suffix = randomUUID().slice(0, 8);
  const mapId = await createMap(page, owned, `SVG preview ${suffix}`);
  const fillers = [];
  for (let index = 0; index < 10; index++) {
    fillers.push(await createNote(page, owned, `A SVG filler ${index} ${suffix}`, "A separate reference on the study board."));
  }
  await addMaterials(page, mapId, [...fillers.map((entry) => entry.id), note.id]);
  await page.goto(`/study-map?map=${mapId}`);
  await page.getByRole("button", { name: "Focus board", exact: true }).click();
  await expect(page.getByRole("region", { name: "Study map canvas", exact: true }).getByRole("button", { name: "Add to board", exact: true })).toBeEnabled();
  await expect(canvasCard(page, note.id)).not.toBeInViewport();
  await selectBoardCard(page, note.title);
  await expectCardStaysInView(page, note.id);
  const rendered = canvasCard(page, note.id).getByRole("img", { name: `Preview of ${note.title}`, exact: true });
  await expect.poll(() => rendered.evaluate((element) => element instanceof HTMLImageElement ? element.naturalWidth : 0)).toBeGreaterThan(0);
  await expectCardStaysInView(page, note.id);
  await screenshot(page, testInfo, "desktop-live-svg-preview");
  expect(browserErrors).toEqual([]);
});

test("original-note labels, map pickers and all-module facets agree on desktop and a phone", async ({
  loggedInPage: page,
  owned,
  browserErrors,
}, testInfo) => {
  const suffix = randomUUID().slice(0, 8);
  const firstName = `Search graphs ${suffix}`;
  const secondName = `Search databases ${suffix}`;
  const firstMap = await createMap(page, owned, firstName);
  const secondMap = await createMap(page, owned, secondName);
  const firstTopics = await addReviewedTopics(page, firstMap, ["Graphs"]);
  const secondTopics = await addReviewedTopics(page, secondMap, ["Queries"]);
  const shared = await createNote(
    page,
    owned,
    `Shared search example ${suffix}`,
    "Graphs and Queries can represent the same relationships in different forms.",
  );
  const other = await createNote(
    page,
    owned,
    `Other search example ${suffix}`,
    "Graphs represent vertices and edges.",
  );
  const label = `revision-${suffix}`;
  await addMaterials(page, firstMap, [shared.id, other.id]);
  await reviewMaterial(
    page,
    firstMap,
    shared.id,
    { [firstTopics[0].id]: "core" },
    [label],
  );
  await reviewMaterial(
    page,
    firstMap,
    other.id,
    { [firstTopics[0].id]: "core" },
    [label],
  );

  await page.goto(`/notes/${shared.id}`);
  const labels = page.getByRole("region", {
    name: "Note study labels",
    exact: true,
  });
  await expect(
    labels.getByRole("link", { name: "Graphs, core, accepted", exact: true }),
  ).toBeVisible();
  await labels
    .getByRole("button", { name: "Add to another study map", exact: true })
    .click();
  await labels
    .getByRole("combobox", { name: "Choose a study map", exact: true })
    .selectOption(secondMap);
  await labels.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(
    labels.getByRole("link", { name: secondName, exact: true }),
  ).toBeVisible();
  await reviewMaterial(
    page,
    secondMap,
    shared.id,
    { [secondTopics[0].id]: "supporting" },
    [`database-${suffix}`],
  );
  await page.reload();
  await expect(
    labels.getByRole("link", {
      name: "Queries, supporting, accepted",
      exact: true,
    }),
  ).toBeVisible();
  await labels.getByRole("link", { name: firstName, exact: true }).click();
  await expect(
    page.getByLabel("Labels, separated by commas", { exact: true }),
  ).toHaveValue(label);
  await page
    .getByRole("button", { name: "Close inspector", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Search all modules", exact: true })
    .click();
  const search = page.getByRole("region", {
    name: "Search study materials",
    exact: true,
  });
  await search
    .getByRole("searchbox", {
      name: "Search notes, topics, aliases and labels",
      exact: true,
    })
    .fill(shared.title);
  await expect(
    search.getByRole("link", { name: shared.title, exact: true }),
  ).toHaveCount(2);
  await expect(
    search.getByRole("option", { name: `${firstName} · 2`, exact: true }),
  ).toHaveCount(1);
  await expect(
    search.getByRole("option", { name: `${secondName} · 1`, exact: true }),
  ).toHaveCount(1);
  await expect(
    search.getByRole("option", { name: `${label} · 2`, exact: true }),
  ).toHaveCount(1);
  await search
    .getByRole("combobox", { name: "Module", exact: true })
    .selectOption(secondMap);
  await expect(
    search.getByRole("link", { name: shared.title, exact: true }),
  ).toHaveCount(1);
  await expect(
    search
      .getByRole("combobox", { name: "Topic", exact: true })
      .getByRole("option", { name: "Queries · 1", exact: true }),
  ).toHaveCount(1);
  await expect(
    search
      .getByRole("combobox", { name: "Topic", exact: true })
      .getByRole("option", { name: /^Graphs/ }),
  ).toHaveCount(0);
  await search
    .getByRole("combobox", { name: "Module", exact: true })
    .selectOption(firstMap);
  await search
    .getByRole("combobox", { name: "Label", exact: true })
    .selectOption(label);
  await expect(
    search.getByRole("link", { name: shared.title, exact: true }),
  ).toHaveCount(1);
  await expect(
    search.getByRole("option", { name: `${label} · 2`, exact: true }),
  ).toHaveCount(1);
  await expectNoPageOverflow(page);
  await screenshot(page, testInfo, "desktop-search-facets");

  await page
    .getByRole("button", { name: "Back to module", exact: true })
    .click();
  await page.getByRole("tab", { name: "Materials", exact: true }).click();
  const materialList = page.getByRole("tabpanel", {
    name: "Materials",
    exact: true,
  });
  await materialList
    .getByLabel("Search materials", { exact: true })
    .fill(shared.title);
  await materialList
    .getByRole("combobox", { name: "Label", exact: true })
    .selectOption(label);
  await expect(
    materialList.getByRole("button", { name: new RegExp(other.title) }),
  ).toHaveCount(0);
  await materialList
    .getByRole("link", { name: "Open original", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/notes/${shared.id}$`));
  await page.goBack();
  await expect(
    page.getByRole("combobox", { name: "Module", exact: true }),
  ).toHaveValue(firstMap);
  await expect(
    page.getByRole("tab", { name: "Materials", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    materialList.getByLabel("Search materials", { exact: true }),
  ).toHaveValue(shared.title);
  await expect(
    materialList.getByRole("combobox", { name: "Label", exact: true }),
  ).toHaveValue(label);
  await expect(
    materialList.getByRole("button", { name: new RegExp(shared.title) }),
  ).toBeVisible();
  await expect(
    materialList.getByRole("button", { name: new RegExp(other.title) }),
  ).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/study-map?map=${firstMap}&tab=materials`);
  await expect(
    page.getByRole("tab", { name: "Materials", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Materials", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Canvas", exact: true }),
  ).toHaveAttribute("aria-selected", "false");
  await expectNoPageOverflow(page);
  await page
    .getByRole("tabpanel", { name: "Materials", exact: true })
    .getByRole("button", { name: new RegExp(shared.title) })
    .scrollIntoViewIfNeeded();
  await screenshot(page, testInfo, "mobile-material-list");
  await page
    .getByRole("tabpanel", { name: "Materials", exact: true })
    .getByRole("button", { name: new RegExp(shared.title) })
    .click();
  const inspector = page.getByRole("dialog", {
    name: "Study map inspector",
    exact: true,
  });
  const mobileLabels = inspector.getByLabel("Labels, separated by commas", {
    exact: true,
  });
  await expect(mobileLabels).toBeVisible();
  await expect(mobileLabels).toHaveValue(label);
  await expectNoPageOverflow(page);
  await screenshot(page, testInfo, "mobile-inspector");
  await inspector
    .getByRole("button", { name: "Close inspector", exact: true })
    .click();
  await expect(inspector).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test("exam analysis keeps unknowns unresolved and counts only a reviewed compatible paper", async ({
  loggedInPage: page,
  owned,
  browserErrors,
}, testInfo) => {
  const suffix = randomUUID().slice(0, 8);
  const name = `Exam algorithms ${suffix}`;
  const mapId = await createMap(page, owned, name);
  const topics = await addReviewedTopics(page, mapId, ["Graphs", "Complexity"]);
  const valid = await createNote(
    page,
    owned,
    `Complete paper ${suffix}`,
    "# Algorithms examination 2025\n\nSitting: Summer\nSyllabus: 2025/26\nTotal marks: 20\n\n## Section A\n\nAnswer 1 of 2 questions.\n\n### Question 1 [20 marks]\n\nExplain Graphs and Complexity using graph search.\n\n### Question 2 [20 marks]\n\nCompare Graphs representations.",
  );
  const unknown = await createNote(
    page,
    owned,
    `Incomplete paper ${suffix}`,
    "# Algorithms examination 2024\n\nSitting: Summer\nSyllabus: 2025/26\n\n## Section A\n\nAnswer an appropriate selection of questions.\n\n### Question 1\n\nExplain Graphs and Complexity using graph search.\n\n### Question 2 [20 marks]\n\nCompare Graphs representations.",
  );
  await addMaterials(page, mapId, [valid.id, unknown.id]);
  await reviewMaterial(
    page,
    mapId,
    valid.id,
    { [topics[0].id]: "core" },
    [],
    "past_paper",
  );
  await reviewMaterial(
    page,
    mapId,
    unknown.id,
    { [topics[0].id]: "core" },
    [],
    "past_paper",
  );
  await page.goto(`/study-map?map=${mapId}`);
  await page.getByRole("tab", { name: "Exam history", exact: true }).click();
  for (const paper of [valid, unknown]) {
    const pending = page.locator("article").filter({
      has: page.getByRole("heading", { name: paper.title, exact: true }),
    });
    await pending
      .getByRole("button", { name: "Analyse paper", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await readSnapshot(page, mapId)).papers.some(
            (entry) => entry.noteId === paper.id,
          ),
        { timeout: 45_000 },
      )
      .toBe(true);
  }
  const incomplete = page.locator("article").filter({
    has: page
      .locator("summary")
      .filter({ hasText: new RegExp(`^${unknown.title}`) }),
  });
  await incomplete.locator("summary").click();
  await expect(
    incomplete.getByLabel("Printed marks", { exact: true }).first(),
  ).toHaveValue("");
  await expect(
    incomplete.getByLabel("Questions to answer", { exact: true }),
  ).toHaveValue("");
  await expect(
    incomplete.getByRole("button", { name: "Approve paper", exact: true }),
  ).toBeDisabled();
  await expect(
    incomplete.getByRole("checkbox", { name: /^I checked the source/ }),
  ).toBeDisabled();
  await expect(
    incomplete.getByText(/^Resolve \d+ issues? before approval$/),
  ).toBeVisible();
  await incomplete.locator("summary").click();

  const complete = page.locator("article").filter({
    has: page
      .locator("summary")
      .filter({ hasText: new RegExp(`^${valid.title}`) }),
  });
  await complete.locator("summary").click();
  await expect(
    complete.getByLabel("Questions to answer", { exact: true }),
  ).toHaveValue("1");
  await expect(
    complete.getByRole("button", { name: "Approve paper", exact: true }),
  ).toBeDisabled();
  await complete
    .getByRole("checkbox", { name: /^I checked the source/ })
    .check();
  await complete
    .getByRole("button", { name: "Approve paper", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await readSnapshot(page, mapId)).papers.find(
          (entry) => entry.noteId === valid.id,
        )?.reviewed,
    )
    .toBe(true);
  const coverage = page.getByRole("region", {
    name: "Historical topic coverage",
    exact: true,
  });
  await expect(coverage.getByRole("table")).toBeVisible();
  const graphRow = coverage.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: "Graphs", exact: true }),
  });
  const complexityRow = coverage.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: "Complexity", exact: true }),
  });
  await expect(graphRow.getByRole("cell").nth(0)).toContainText("1/1");
  await expect(graphRow.getByRole("cell").nth(1)).toHaveText("20");
  await expect(graphRow.getByRole("cell").nth(2)).toHaveText("20");
  await expect(complexityRow.getByRole("cell").nth(1)).toHaveText("0");
  await expect(complexityRow.getByRole("cell").nth(2)).toHaveText("20");
  await coverage
    .getByRole("checkbox", { name: "Show choice bounds", exact: true })
    .check();
  await expect(graphRow.getByRole("cell").nth(3)).toHaveText("20 to 20");
  await expect(complexityRow.getByRole("cell").nth(3)).toHaveText("0 to 20");
  await expectNoPageOverflow(page);
  await screenshot(page, testInfo, "desktop-reviewed-exam-coverage");
  expect(browserErrors).toEqual([]);
});
