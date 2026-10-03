import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { createNoteViaApi, expect, test as fixtureTest } from "../fixtures";
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
  return page.locator(`.react-flow__node[data-id="note:${noteId}"]`);
}

async function cardPosition(card: Locator) {
  return card.evaluate((element) => {
    const transform = new DOMMatrix(getComputedStyle(element).transform);
    return { x: transform.m41, y: transform.m42 };
  });
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
  const definitions = page.locator("details").filter({
    has: page
      .locator("summary")
      .filter({ hasText: "Review topic definitions" }),
  });
  await definitions.locator("summary").click();
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

test("canvas drafts survive original-note visits and reload before pins and links are saved", async ({
  loggedInPage: page,
  owned,
  browserErrors,
}, testInfo) => {
  const suffix = randomUUID().slice(0, 8);
  const name = `Canvas algorithms ${suffix}`;
  const mapId = await createMap(page, owned, name);
  const topics = await addReviewedTopics(page, mapId, ["Graphs", "Complexity"]);
  const first = await createNote(
    page,
    owned,
    `Canvas graph note ${suffix}`,
    "Graphs and Complexity describe graph traversal and its runtime.",
  );
  const second = await createNote(
    page,
    owned,
    `Canvas runtime note ${suffix}`,
    "Complexity compares growth in the runtime of algorithms.",
  );
  await addMaterials(page, mapId, [first.id, second.id]);
  await reviewMaterial(
    page,
    mapId,
    first.id,
    { [topics[0].id]: "core", [topics[1].id]: "supporting" },
    ["revision"],
  );
  await reviewMaterial(page, mapId, second.id, { [topics[1].id]: "core" }, []);
  await page.goto(`/study-map?map=${mapId}`);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const firstCard = canvasCard(page, first.id);
  const canvasBounds = await page
    .getByRole("region", { name: "Study map canvas", exact: true })
    .boundingBox();
  expect(canvasBounds?.height ?? 0).toBeGreaterThan(400);
  await expect(firstCard).toBeVisible();
  await firstCard.scrollIntoViewIfNeeded();
  await expect(firstCard).toBeInViewport();
  const before = await cardPosition(firstCard);
  await firstCard
    .getByRole("heading", { name: first.title, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move card right", exact: true })
    .click();
  await expect
    .poll(() => cardPosition(firstCard))
    .toEqual({ x: before.x + 24, y: before.y });
  await firstCard
    .getByRole("button", { name: `Pin ${first.title}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Move card right", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Add link", exact: true }).click();
  await page
    .getByRole("combobox", { name: "From", exact: true })
    .selectOption(`note:${first.id}`);
  await page
    .getByRole("combobox", { name: "To", exact: true })
    .selectOption(`note:${second.id}`);
  await page
    .getByRole("textbox", { name: "Relationship", exact: true })
    .fill("supports analysis");
  await page.getByRole("button", { name: "Save link", exact: true }).click();
  const persistedBeforeSave = (await readSnapshot(page, mapId)).map.board;
  expect(persistedBeforeSave.links).toHaveLength(0);
  await expect(page.getByText("Unsaved layout", { exact: true })).toBeVisible();
  await firstCard
    .getByRole("link", { name: "Open original", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/notes/${first.id}$`));

  for (const navigation of ["back", "reload"] as const) {
    if (navigation === "back") await page.goBack();
    else await page.reload();
    await expect(
      page.getByRole("tab", { name: "Canvas", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByText("Unsaved layout", { exact: true }),
    ).toBeVisible();
    await expect(
      firstCard.getByRole("button", {
        name: `Unpin ${first.title}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect
      .poll(() => cardPosition(firstCard))
      .toEqual({ x: before.x + 24, y: before.y });
    await expect(
      page
        .locator(".react-flow__edge-text")
        .filter({ hasText: "supports analysis" }),
    ).toBeVisible();
    await expect(firstCard).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Save layout", exact: true }),
    ).toBeEnabled();
    expect(
      (await readSnapshot(page, mapId)).map.board,
      `server layout stays unchanged after ${navigation}`,
    ).toEqual(persistedBeforeSave);
  }
  await page
    .getByRole("region", { name: "Study map canvas", exact: true })
    .scrollIntoViewIfNeeded();
  await screenshot(page, testInfo, "desktop-restored-unsaved-canvas");

  const saving = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/study-maps/${mapId}/board` &&
      response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  expect((await saving).ok()).toBe(true);
  const saved = await readSnapshot(page, mapId);
  expect(
    saved.map.board.placements.find((entry) => entry.id === `note:${first.id}`),
  ).toMatchObject({ x: before.x + 24, y: before.y, pinned: true });
  expect(saved.map.board.links).toHaveLength(1);
  expect(saved.map.board.links[0]).toMatchObject({
    source: `note:${first.id}`,
    target: `note:${second.id}`,
    label: "supports analysis",
  });

  await page.reload();
  await expect(
    firstCard.getByRole("button", {
      name: `Unpin ${first.title}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() => cardPosition(firstCard))
    .toEqual({ x: before.x + 24, y: before.y });
  await expect(
    page
      .locator(".react-flow__edge-text")
      .filter({ hasText: "supports analysis" }),
  ).toBeVisible();
  await expect(canvasCard(page, first.id)).toHaveCount(1);
  await page
    .getByRole("region", { name: "Study map canvas", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(firstCard).toBeInViewport();
  await expectNoPageOverflow(page);
  await screenshot(page, testInfo, "desktop-saved-canvas");
  await firstCard
    .getByRole("link", { name: "Open original", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/notes/${first.id}$`));
  const labels = page.getByRole("region", {
    name: "Note study labels",
    exact: true,
  });
  await expect(
    labels.getByRole("link", { name: name, exact: true }),
  ).toBeVisible();
  await expect(
    labels.getByRole("link", { name: "Graphs, core, accepted", exact: true }),
  ).toBeVisible();
  await expect(
    labels.getByRole("link", {
      name: "Complexity, supporting, accepted",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    labels.getByText("revision · your label", { exact: true }),
  ).toBeVisible();
  const original = await page.request.get(`/api/notes/${first.id}`);
  const noteBody: unknown = await original.json();
  expect(z.object({ content: z.string() }).parse(noteBody).content).toBe(
    first.content,
  );
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
  await page.goto(`/study-map?map=${firstMap}`);
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
