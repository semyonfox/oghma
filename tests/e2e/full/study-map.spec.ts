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
    syllabusNoteId: z.uuid().nullable(),
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
  // layout tests drive the map by hand; background sorting would refresh it underneath them
  const { map } = await readSnapshot(page, mapId);
  const manual = await page.request.patch(`/api/study-maps/${mapId}`, {
    headers: origin(page),
    data: {
      name,
      academicYear: "2025/26",
      rootNoteId: null,
      canvasCourseId: null,
      syllabusNoteId: null,
      autoClassify: false,
      version: map.version,
    },
  });
  expect(manual.ok()).toBe(true);
  return mapId;
}

async function uploadNote(
  page: Page,
  owned: OwnedRecords,
  name: string,
  mimeType: string,
  buffer: Buffer,
) {
  const response = await page.request.post("/api/upload", {
    headers: origin(page),
    multipart: { file: { name, mimeType, buffer } },
  });
  expect(response.status()).toBe(200);
  const note = z
    .object({
      noteId: z.uuid(),
      fileName: z.string(),
      createdNewNote: z.literal(true),
    })
    .parse(await response.json());
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

function flowCard(page: Page, noteId: string) {
  return page.locator(`[data-card="note:${noteId}"]`);
}

function studyMap(page: Page) {
  return page.getByRole("application", { name: /^Study map\./ });
}

async function openMap(page: Page, mapId: string) {
  await page.goto(`/study-map?map=${mapId}&tab=canvas`);
  await expect(studyMap(page)).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: /^Layout saved$/ }),
  ).toBeVisible();
}

function boardSaved(page: Page, mapId: string) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/study-maps/${mapId}/board` &&
      response.request().method() === "PUT",
  );
}

async function cardBox(card: Locator) {
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  if (!box) throw new Error("The study card is not visible");
  return box;
}

async function dragCard(page: Page, card: Locator, dx: number, dy: number) {
  const box = await cardBox(card);
  const x = box.x + box.width / 2;
  const y = box.y + 18;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}

async function selectCard(page: Page, card: Locator) {
  const box = await cardBox(card);
  await page.mouse.click(box.x + box.width / 2, box.y + 18);
  const toolbar = page.getByRole("toolbar", { name: /^Actions for / });
  await expect(toolbar).toBeVisible();
  return toolbar;
}

async function closePreview(page: Page) {
  const close = page.getByRole("button", {
    name: "Close preview",
    exact: true,
  });
  if (await close.isVisible()) await close.click();
  // clicking empty canvas clears the selection and its floating toolbar
  const board = await studyMap(page).boundingBox();
  if (!board) throw new Error("The study map is not visible");
  await page.mouse.click(board.x + 12, board.y + 12);
  await expect(
    page.getByRole("toolbar", { name: /^Actions for / }),
  ).toHaveCount(0);
}

test("a student adds a module and its notes, and topics and classification follow on their own", async ({
  loggedInPage: page,
  owned,
  browserErrors,
}, testInfo) => {
  const suffix = randomUUID().slice(0, 8);
  const name = `Workflow algorithms ${suffix}`;
  const syllabus = await createNote(
    page,
    owned,
    `Workflow course outline ${suffix}`,
    "## Graphs\n\nGraphs represent vertices and edges. Graph traversal visits reachable vertices with a frontier.\n\n## Complexity\n\nComplexity describes the time and space used by algorithms as the input grows.",
  );
  const lecture = await createNote(
    page,
    owned,
    `Workflow graph lecture ${suffix}`,
    "Graphs represent vertices and edges. Graph traversal visits reachable vertices with a frontier. Breadth first search stores vertices in a queue. Complexity describes the time and space used by algorithms as the input grows.",
  );

  await page.goto("/study-map");
  await page.getByRole("button", { name: "Add module", exact: true }).click();
  await page.getByLabel("Module name", { exact: true }).fill(name);
  const created = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/study-maps" &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Add module", exact: true })
    .last()
    .click();
  const createResponse = await created;
  expect(createResponse.status()).toBe(201);
  const body: unknown = await createResponse.json();
  const { mapId } = mapResponseSchema.parse(body);
  owned.maps.push(mapId);
  await expect(
    page.getByRole("heading", { name, exact: true }).first(),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Add materials", exact: true })
    .click();
  for (const note of [syllabus, lecture]) {
    await page
      .getByLabel("Search library by title", { exact: true })
      .fill(note.title);
    await page.getByRole("checkbox", { name: note.title, exact: true }).check();
  }
  await page
    .getByRole("button", { name: "Add 2 materials", exact: true })
    .click();
  // nothing else to choose: the outline is recognised and topics come from the notes
  await expect
    .poll(async () => (await readSnapshot(page, mapId)).map.syllabusNoteId)
    .toBe(syllabus.id);

  await expect
    .poll(
      async () =>
        (await readSnapshot(page, mapId)).map.topics
          .map((entry) => `${entry.name}:${entry.reviewed}`)
          .sort(),
      { timeout: 45_000 },
    )
    .toEqual(["Complexity:true", "Graphs:true"]);
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

test("notes sit in their week and between their topics, preview on hover, and moved cards save automatically", async ({
  loggedInPage: page,
  owned,
  browserErrors,
}, testInfo) => {
  const suffix = randomUUID().slice(0, 8);
  const mapId = await createMap(page, owned, `Flow algorithms ${suffix}`);
  const topics = await addReviewedTopics(page, mapId, ["Graphs", "Complexity"]);
  const early = await createNote(
    page,
    owned,
    `Week 1: graph basics ${suffix}`,
    "# Graph basics\n\nGraphs describe vertices and edges. Traversal visits reachable vertices.",
  );
  const both = await createNote(
    page,
    owned,
    `Week 3: traversal cost ${suffix}`,
    "Breadth first search runs in time proportional to vertices and edges.",
  );
  const late = await createNote(
    page,
    owned,
    `Week 5: growth rates ${suffix}`,
    "Complexity compares how runtime grows with input size.",
  );
  await addMaterials(page, mapId, [early.id, both.id, late.id]);
  await reviewMaterial(page, mapId, early.id, { [topics[0].id]: "core" }, []);
  await reviewMaterial(
    page,
    mapId,
    both.id,
    { [topics[0].id]: "core", [topics[1].id]: "core" },
    [],
  );
  await reviewMaterial(page, mapId, late.id, { [topics[1].id]: "core" }, []);
  await openMap(page, mapId);

  await expect(studyMap(page).locator("[data-week-label]")).toHaveText([
    "Week 1",
    "Week 3",
    "Week 5",
  ]);
  const [earlyBox, bothBox, lateBox] = await Promise.all(
    [early, both, late].map((note) => cardBox(flowCard(page, note.id))),
  );
  expect(earlyBox.x).toBeLessThan(bothBox.x);
  expect(bothBox.x).toBeLessThan(lateBox.x);
  const graphsRow = await cardBox(
    studyMap(page).locator(`[data-legend="${topics[0].id}"]`),
  );
  const complexityRow = await cardBox(
    studyMap(page).locator(`[data-legend="${topics[1].id}"]`),
  );
  const middle = (box: { y: number; height: number }) => box.y + box.height / 2;
  expect(Math.abs(middle(earlyBox) - middle(graphsRow))).toBeLessThan(
    Math.abs(middle(earlyBox) - middle(complexityRow)),
  );
  expect(middle(bothBox)).toBeGreaterThan(middle(earlyBox));
  expect(middle(bothBox)).toBeLessThan(middle(lateBox));

  await flowCard(page, early.id).hover();
  const preview = page.getByRole("dialog", {
    name: `Preview of ${early.title}`,
    exact: true,
  });
  await expect(preview).toContainText("Graphs describe vertices and edges.");
  await expect(
    preview.getByRole("heading", { name: "Graph basics", exact: true }),
  ).toHaveCount(0);
  await expect(
    preview.getByRole("link", { name: /Open in editor/ }),
  ).toHaveAttribute("href", `/notes/${early.id}`);
  await screenshot(page, testInfo, "desktop-flow-preview");
  await page.mouse.move(5, 5);

  const saved = boardSaved(page, mapId);
  await dragCard(page, flowCard(page, late.id), 0, 140);
  expect((await saved).ok()).toBe(true);
  const placement = (await readSnapshot(page, mapId)).map.board.placements.find(
    (entry) => entry.id === `note:${late.id}`,
  );
  expect(placement).toMatchObject({ pinned: false });
  await page.reload();
  await expect(studyMap(page)).toBeVisible();
  await expect
    .poll(
      async () =>
        (await cardBox(flowCard(page, late.id))).y -
        (await cardBox(flowCard(page, both.id))).y,
    )
    .toBeGreaterThan(100);

  const toolbar = await selectCard(page, flowCard(page, late.id));
  const pinned = boardSaved(page, mapId);
  await toolbar.getByRole("button", { name: "Pin", exact: true }).click();
  expect((await pinned).ok()).toBe(true);
  await expect
    .poll(
      async () =>
        (await readSnapshot(page, mapId)).map.board.placements.find(
          (entry) => entry.id === `note:${late.id}`,
        )?.pinned,
    )
    .toBe(true);
  await closePreview(page);
  const tidied = boardSaved(page, mapId);
  await dragCard(page, flowCard(page, early.id), 0, 160);
  expect((await tidied).ok()).toBe(true);
  const tidy = boardSaved(page, mapId);
  await page.getByRole("button", { name: "Tidy layout", exact: true }).click();
  expect((await tidy).ok()).toBe(true);
  await expect
    .poll(async () =>
      (await readSnapshot(page, mapId)).map.board.placements.map(
        (entry) => entry.id,
      ),
    )
    .toEqual([`note:${late.id}`]);
  expect(browserErrors).toEqual([]);
});

test("following a topic steps through its notes in week order and the reader opens notes in place", async ({
  loggedInPage: page,
  owned,
  browserErrors,
}, testInfo) => {
  const suffix = randomUUID().slice(0, 8);
  const mapId = await createMap(page, owned, `Trail algorithms ${suffix}`);
  const [graphs, complexity] = await addReviewedTopics(page, mapId, [
    "Graphs",
    "Complexity",
  ]);
  const notes = [];
  for (const [week, text] of [
    [4, "Shortest paths relax edges."],
    [2, "Graphs have vertices and edges."],
    [6, "Spanning trees connect every vertex."],
  ] as const) {
    notes.push(
      await createNote(
        page,
        owned,
        `Week ${week}: graphs part ${week} ${suffix}`,
        text,
      ),
    );
  }
  const supporting = await createNote(
    page,
    owned,
    `Week 3: complexity ${suffix}`,
    "Complexity of graph algorithms.",
  );
  await addMaterials(page, mapId, [
    ...notes.map((note) => note.id),
    supporting.id,
  ]);
  for (const note of notes)
    await reviewMaterial(page, mapId, note.id, { [graphs.id]: "core" }, []);
  await reviewMaterial(
    page,
    mapId,
    supporting.id,
    { [complexity.id]: "core", [graphs.id]: "supporting" },
    [],
  );
  await openMap(page, mapId);

  await studyMap(page).locator(`[data-legend="${graphs.id}"]`).click();
  const trail = page.getByRole("complementary", {
    name: "Graphs through the course",
    exact: true,
  });
  await expect(trail).toContainText("Stop 1 of 3");
  await expect(trail.getByRole("listitem")).toHaveText([
    /Week 2/,
    /Week 4/,
    /Week 6/,
  ]);
  await expect(trail).toContainText(`Week 3: complexity ${suffix}`);
  await trail.getByRole("button", { name: "Next ›", exact: true }).click();
  await expect(trail).toContainText("Stop 2 of 3");
  await expect(flowCard(page, notes[0].id)).toBeFocused();
  await expect(flowCard(page, supporting.id)).not.toHaveClass(/opacity-15/);
  await screenshot(page, testInfo, "desktop-topic-trail");
  await page.keyboard.press("Enter");
  const reader = page.getByRole("complementary", {
    name: `Reading ${notes[0].title}`,
    exact: true,
  });
  await expect(reader).toContainText("Shortest paths relax edges.");
  await expect(
    reader.getByRole("link", { name: /Open in editor/ }),
  ).toHaveAttribute("href", `/notes/${notes[0].id}`);
  await reader
    .getByRole("button", { name: "Close reader", exact: true })
    .click();
  await trail
    .getByRole("button", { name: "Stop following this topic", exact: true })
    .click();
  await expect(trail).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test("note references, your own labelled links, week overrides and conflicts stay explicit", async ({
  loggedInPage: page,
  owned,
  browserErrors,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const mapId = await createMap(page, owned, `Links algorithms ${suffix}`);
  const otherMap = await createMap(page, owned, `Links runtime ${suffix}`);
  const [graphs] = await addReviewedTopics(page, mapId, ["Graphs"]);
  const target = await createNote(
    page,
    owned,
    `Week 1: vertices ${suffix}`,
    "Vertices and edges.",
  );
  const elsewhere = await createNote(
    page,
    owned,
    `Week 2: runtime ${suffix}`,
    "Runtime in another module.",
  );
  const source = await createNote(
    page,
    owned,
    `Week 2: traversal ${suffix}`,
    `Traversal builds on [vertices](/notes/${target.id}) and [runtime](/notes/${elsewhere.id}).`,
  );
  await addMaterials(page, mapId, [target.id, source.id]);
  await addMaterials(page, otherMap, [elsewhere.id]);
  for (const note of [target, source])
    await reviewMaterial(page, mapId, note.id, { [graphs.id]: "core" }, []);
  await openMap(page, mapId);

  await flowCard(page, source.id).hover();
  const preview = page.getByRole("dialog", {
    name: `Preview of ${source.title}`,
    exact: true,
  });
  await expect(
    preview.getByRole("button", {
      name: new RegExp(`links to → ${target.title}`),
    }),
  ).toContainText("in note");
  await page.mouse.move(5, 5);

  const toolbar = await selectCard(page, flowCard(page, source.id));
  await toolbar.getByRole("button", { name: "Link to…", exact: true }).click();
  await flowCard(page, target.id).click({ position: { x: 120, y: 18 } });
  await page.getByRole("button", { name: "builds on", exact: true }).click();
  const linked = boardSaved(page, mapId);
  await page.getByRole("button", { name: "Save link", exact: true }).click();
  expect((await linked).ok()).toBe(true);
  await expect
    .poll(async () => (await readSnapshot(page, mapId)).map.board.links)
    .toEqual([
      expect.objectContaining({
        source: `note:${source.id}`,
        target: `note:${target.id}`,
        label: "builds on",
      }),
    ]);

  const weekToolbar = await selectCard(page, flowCard(page, target.id));
  const weekSaved = boardSaved(page, mapId);
  await weekToolbar
    .getByRole("combobox", { name: "Week", exact: true })
    .selectOption("5");
  expect((await weekSaved).ok()).toBe(true);
  await expect(studyMap(page).locator('[data-week-label="5"]')).toBeVisible();
  expect((await readSnapshot(page, mapId)).map.board.weeks).toEqual({
    [`note:${target.id}`]: 5,
  });
  await closePreview(page);

  const current = await readSnapshot(page, mapId);
  const elsewhereSave = await page.request.put(
    `/api/study-maps/${mapId}/board`,
    {
      headers: origin(page),
      data: {
        version: current.map.boardVersion,
        board: { ...current.map.board, weeks: {} },
      },
    },
  );
  expect(elsewhereSave.ok()).toBe(true);
  const conflicted = boardSaved(page, mapId);
  await dragCard(page, flowCard(page, source.id), 0, 120);
  expect((await conflicted).status()).toBe(409);
  // the browser logs the deliberate conflict response; every other error still fails the test
  await expect
    .poll(
      () =>
        browserErrors.filter((error) => error.includes("409 (Conflict)"))
          .length,
    )
    .toBe(1);
  browserErrors.splice(
    browserErrors.findIndex((error) => error.includes("409 (Conflict)")),
    1,
  );
  const banner = page
    .getByRole("alert")
    .filter({ hasText: "changed in another tab or device" });
  await expect(banner).toBeVisible();
  await banner
    .getByRole("button", { name: "Use the latest", exact: true })
    .click();
  await expect(banner).toHaveCount(0);
  await expect(studyMap(page).locator('[data-week-label="5"]')).toHaveCount(0);

  await page.getByRole("button", { name: /^All modules/ }).click();
  await expect(
    studyMap(page).getByRole("region", {
      name: `Links runtime ${suffix} 2025/26`,
      exact: true,
    }),
  ).toBeVisible();
  await flowCard(page, source.id).hover();
  await expect(
    page
      .getByRole("dialog", { name: `Preview of ${source.title}`, exact: true })
      .getByRole("button", {
        name: new RegExp(`links to → ${elsewhere.title}`),
      }),
  ).toContainText(`Links runtime ${suffix}`);
  expect(browserErrors).toEqual([]);
});

test("removing a material prunes its card and links, and source edits update cards without moving them", async ({
  loggedInPage: page,
  owned,
  browserErrors,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const mapId = await createMap(page, owned, `Source sync ${suffix}`);
  const first = await createNote(
    page,
    owned,
    `Week 1: graph ${suffix}`,
    "Graphs describe the connections between vertices.",
  );
  const second = await createNote(
    page,
    owned,
    `Week 2: runtime ${suffix}`,
    "Runtime describes how the number of operations grows.",
  );
  await addMaterials(page, mapId, [first.id, second.id]);
  const before = await readSnapshot(page, mapId);
  const placement = {
    id: `note:${first.id}`,
    x: 640,
    y: 420,
    pinned: true,
    topicId: null,
  };
  const link = {
    id: randomUUID(),
    source: `note:${second.id}`,
    target: `note:${first.id}`,
    label: "uses",
  };
  const saved = await page.request.put(`/api/study-maps/${mapId}/board`, {
    headers: origin(page),
    data: {
      version: before.map.boardVersion,
      board: { ...before.map.board, placements: [placement], links: [link] },
    },
  });
  expect(saved.ok()).toBe(true);
  await openMap(page, mapId);
  const position = await cardBox(flowCard(page, first.id));

  const title = `Week 1: updated graph ${suffix}`;
  const updated = await page.request.put(`/api/notes/${first.id}`, {
    headers: origin(page),
    data: {
      title,
      content: "A graph now describes a revised set of vertices.",
    },
  });
  expect(updated.ok()).toBe(true);
  await page.goto(`/notes/${first.id}`);
  await page.goBack();
  await expect(flowCard(page, first.id)).toContainText(title);
  await expect(flowCard(page, first.id)).toContainText(
    "A graph now describes a revised set of vertices.",
  );
  expect(await cardBox(flowCard(page, first.id))).toMatchObject({
    x: position.x,
    y: position.y,
  });

  const removed = await page.request.delete(
    `/api/study-maps/${mapId}/materials`,
    { headers: origin(page), data: { noteId: second.id } },
  );
  expect(removed.ok()).toBe(true);
  await page.reload();
  await expect(studyMap(page)).toBeVisible();
  await expect(flowCard(page, second.id)).toHaveCount(0);
  expect((await readSnapshot(page, mapId)).map.board).toMatchObject({
    placements: [placement],
    links: [],
  });
  const library = await page.request.get(`/api/notes/${second.id}`);
  expect(library.ok()).toBe(true);
  expect(browserErrors).toEqual([]);
});

test("file cards preview uploaded PDFs and images, and the reader shows PDF pages", async ({
  loggedInPage: page,
  owned,
  browserErrors,
}, testInfo) => {
  const suffix = randomUUID().slice(0, 8);
  const mapId = await createMap(page, owned, `File previews ${suffix}`);
  const pdf = await uploadNote(
    page,
    owned,
    `week-02-slides-${suffix}.pdf`,
    "application/pdf",
    tinyPdf(
      "[Page 1]\nGraphs and their connections.\n[Page 2]\nRuntime and complexity.",
    ),
  );
  const image = await uploadNote(
    page,
    owned,
    `week-03-diagram-${suffix}.png`,
    "image/png",
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  await addMaterials(page, mapId, [pdf.id, image.id]);
  await openMap(page, mapId);

  const renderedPdf = flowCard(page, pdf.id).locator(
    "canvas.react-pdf__Page__canvas",
  );
  await expect(renderedPdf).toBeVisible();
  expect(
    await renderedPdf.evaluate(
      (canvas) =>
        canvas instanceof HTMLCanvasElement &&
        canvas.width > 0 &&
        canvas.height > 0,
    ),
  ).toBe(true);
  const renderedImage = flowCard(page, image.id).getByRole("img", {
    name: `Preview of ${image.title}`,
    exact: true,
  });
  await expect
    .poll(() =>
      renderedImage.evaluate((element) =>
        element instanceof HTMLImageElement ? element.naturalWidth : 0,
      ),
    )
    .toBeGreaterThan(0);
  await screenshot(page, testInfo, "desktop-file-previews");

  await flowCard(page, pdf.id).dblclick({ position: { x: 120, y: 18 } });
  const reader = page.getByRole("complementary", {
    name: `Reading ${pdf.title}`,
    exact: true,
  });
  await expect(reader.locator("canvas.react-pdf__Page__canvas")).toHaveCount(2);
  expect(browserErrors).toEqual([]);
});

test("the seeded module shows assignments, their source notes and one card per extracted PDF", async ({
  loggedInPage: page,
  browserErrors,
}, testInfo) => {
  const seeded = z
    .object({ id: z.uuid(), name: z.string() })
    .array()
    .parse(await (await page.request.get("/api/study-maps")).json())
    .find((map) => map.name === "Operating Systems");
  test.skip(
    !seeded,
    "The Operating Systems module exists only in the synthetic study-map preview seed",
  );
  const pdfId = "71000000-0000-4000-8000-000000000030";
  const markdownId = "71000000-0000-4000-8000-000000000031";
  const svgId = "71000000-0000-4000-8000-000000000032";
  await openMap(page, seeded!.id);
  await expect(flowCard(page, pdfId)).toBeVisible();
  await expect(flowCard(page, markdownId)).toHaveCount(0);
  const assignment = studyMap(page)
    .locator("[data-card^='assignment:']")
    .filter({ hasText: "Assignment 1: scheduler simulator" });
  await assignment.scrollIntoViewIfNeeded();
  await assignment.hover();
  const preview = page.getByRole("dialog", {
    name: "Preview of Assignment 1: scheduler simulator",
    exact: true,
  });
  await expect(preview).toContainText("Draws on");
  await expect(preview).toContainText("Scheduler simulator starter notes");
  await expect(
    studyMap(page)
      .locator("[data-card] button[data-go^='assignment:']")
      .first(),
  ).toBeVisible();
  const svg = flowCard(page, svgId).getByRole("img", {
    name: "Preview of process-states.svg",
    exact: true,
  });
  await svg.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      svg.evaluate((element) =>
        element instanceof HTMLImageElement ? element.naturalWidth : 0,
      ),
    )
    .toBeGreaterThan(0);
  await screenshot(page, testInfo, "desktop-seeded-flow");
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
  await page
    .getByRole("button", { name: "Toggle metadata panel", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: "Toggle metadata panel", exact: true })
    .click();
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
    page.getByRole("tab", { name: "Map", exact: true }),
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
