import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sql from "@/database/pgsql";
import { createNoteWithTree } from "@/lib/notes/storage/create-note";
import * as classification from "@/lib/study-map/classification";
import * as generation from "@/lib/study-map/generation";
import { anchorFromQuote } from "@/lib/study-map/evidence";
import type { BoardSceneElement, StudyBoardScene } from "@/lib/study-map/board-scene";
import { enqueueStudyJobs, processNextStudyJob, reconcileStudyMaps } from "@/lib/study-map/jobs";
import {
  addStudyMaterials, createStudyMap, removeStudyMaterial, reviewStudyMaterial,
  saveStudyBoard, saveStudyPaper, saveStudyTopics, syncStudyMaterials, updateStudyMap,
} from "@/lib/study-map/mutations";
import { getNoteStudyMaps, getStudyMap, getStudyMapSnapshot, loadStudySource } from "@/lib/study-map/repository";
import { searchStudyMaterials } from "@/lib/study-map/search";
import { effectiveAssociations, emptyBoard, topicSchema, type StudyTopic } from "@/lib/study-map/types";

function dedicatedDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("Run study map integration tests through the dedicated mock environment.");
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const dedicated = url.port === "55488" && url.pathname === "/oghma_study_e2e";
  const ci = process.env.CI === "true" && url.port === "5432" && url.pathname === "/oghma_e2e";
  if (!local || (!dedicated && !ci)) {
    throw new Error("Study map integration tests require the dedicated local database, or the isolated oghma_e2e database in CI.");
  }
  return value;
}

const fixture = postgres(dedicatedDatabaseUrl(), { max: 3, connection: { statement_timeout: 5_000 } });
let userId: string;
let otherUserId: string;
let rootId: string;
let syllabusId: string;
let noteId: string;
let otherNoteId: string;
let mapId: string;
let topic: StudyTopic;

function sceneBase(id: string) {
  return {
    id,
    x: 0,
    y: 0,
    width: 160,
    height: 64,
    angle: 0,
    strokeColor: "#172554",
    backgroundColor: "transparent",
    fillStyle: "solid" as const,
    strokeWidth: 1,
    strokeStyle: "solid" as const,
    roundness: null,
    roughness: 0,
    opacity: 100,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: id.replace(/[^A-Za-z0-9]/g, "") || "element",
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  };
}

function textSceneElement(id: string, text: string, containerId: string | null = null): BoardSceneElement {
  return {
    ...sceneBase(id),
    type: "text",
    fontSize: 18,
    fontFamily: 5,
    text,
    originalText: text,
    textAlign: "left",
    verticalAlign: "top",
    containerId,
    autoResize: true,
    lineHeight: 1.25,
  };
}

function embeddableSceneElement(kind: "note" | "topic", id: string, linkedMapId = mapId): BoardSceneElement {
  return {
    ...sceneBase(`ref-${kind}-${id}`),
    type: "embeddable",
    customData: { studyRef: { kind, id } },
    link: kind === "note" ? `/notes/${id}` : `/study-map?topic=${id}&map=${linkedMapId}`,
  };
}

function boardScene(elements: BoardSceneElement[] = []): StudyBoardScene {
  return {
    version: 1,
    elements,
    appState: { scrollX: 0, scrollY: 0, zoom: { value: 1 }, viewBackgroundColor: "#ffffff" },
  };
}

async function makeNote(owner: string, title: string, content: string, folder = false, parentId: string | null = null): Promise<string> {
  const id = randomUUID();
  await createNoteWithTree({ noteId: id, userId: owner, title, content, isFolder: folder, parentId });
  return id;
}

async function correctionInput() {
  const source = await loadStudySource(userId, noteId);
  const map = await getStudyMap(userId, mapId);
  return {
    noteId, sourceHash: source.hash, taxonomyVersion: map.taxonomyVersion,
    kind: "worked_example" as const, labels: ["exam revision"], topics: { [topic.id]: "core" as const },
  };
}

async function storedMaterial() {
  const [material] = await fixture<Array<{
    status: string; source_hash: string; taxonomy_version: number; overrides: unknown; classification: unknown;
  }>>`
    SELECT status, source_hash, taxonomy_version, overrides, classification FROM app.study_materials
    WHERE user_id = ${userId}::uuid AND map_id = ${mapId}::uuid AND note_id = ${noteId}::uuid
  `;
  return material;
}

async function latestJob(targetNoteId = noteId) {
  const [job] = await fixture<Array<{ id: string; state: string; attempts: number; error: string | null; lease_token: string | null }>>`
    SELECT id, state, attempts, error, lease_token FROM app.study_jobs
    WHERE user_id = ${userId}::uuid AND map_id = ${mapId}::uuid AND note_id = ${targetNoteId}::uuid
    ORDER BY created_at DESC, id DESC LIMIT 1
  `;
  return job;
}

async function extractedPaper(content = [
  "# Examination 2025", "Sitting: Summer", "Syllabus version: 2026-2027", "Total marks: 20", "",
  "## Section A", "Answer all questions.", "",
  "### Question 1 [20 marks]", "Explain algorithms and finite procedures.",
].join("\n")) {
  const paperId = await makeNote(userId, "Past paper 2025", content, false, rootId);
  await addStudyMaterials(userId, mapId, [paperId]);
  await enqueueStudyJobs(userId, mapId, { kind: "paper", noteId: paperId });
  await processNextStudyJob();
  const paper = (await getStudyMapSnapshot(userId, mapId)).papers.find((item) => item.noteId === paperId);
  if (!paper) throw new Error("The synthetic examination paper was not extracted.");
  return paper;
}

async function extractedPair() {
  const pdfId = await makeNote(userId, "Synthetic lecture.pdf", "");
  const markdownId = await makeNote(userId, "Synthetic lecture.md", "Algorithms are finite procedures.");
  await fixture`UPDATE app.notes SET s3_key = ${`synthetic/${pdfId}.pdf`} WHERE note_id = ${pdfId}::uuid`;
  await fixture`UPDATE app.notes SET extracted_from_note_id = ${pdfId}::uuid WHERE note_id = ${markdownId}::uuid`;
  return { pdfId, markdownId };
}

async function duringClassification(change: () => Promise<void>): Promise<void> {
  const original = classification.classifyStudySource;
  let release = () => {};
  let announce = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { announce = resolve; });
  vi.spyOn(classification, "classifyStudySource").mockImplementation(async (...args) => {
    announce();
    await gate;
    return original(...args);
  });
  const processing = processNextStudyJob();
  try {
    await Promise.race([
      started,
      processing.then(() => { throw new Error("The queued classification never reached the provider boundary."); }),
    ]);
    await change();
  } finally {
    release();
    await processing;
  }
}

beforeAll(async () => {
  vi.stubEnv("STUDY_CLASSIFIER_PROVIDER", "mock");
  const [{ count }] = await fixture<{ count: number }[]>`
    SELECT count(*)::int AS count FROM app.study_jobs WHERE state IN ('pending', 'running')
  `;
  if (count) throw new Error("The dedicated database has unfinished study jobs. Finish them before running these worker tests.");
});

beforeEach(async () => {
  userId = randomUUID();
  otherUserId = randomUUID();
  for (const owner of [userId, otherUserId]) {
    await fixture`INSERT INTO app.login (user_id, email, hashed_password, email_verified, is_active)
      VALUES (${owner}::uuid, ${`study-integration-${owner}@example.test`}, 'synthetic', TRUE, TRUE)`;
  }
  rootId = await makeNote(userId, "Synthetic module", "", true);
  syllabusId = await makeNote(userId, "Module syllabus", "# Algorithms\n\nAlgorithms describe finite procedures for solving problems.", false, rootId);
  noteId = await makeNote(userId, "Lecture notes", "# Algorithms\n\nAlgorithms solve problems step by step. A definition is a precise description.", false, rootId);
  otherNoteId = await makeNote(otherUserId, "Private lecture", "Private source material.");
  mapId = await createStudyMap(userId, {
    name: "Synthetic module", academicYear: "2026-2027", rootNoteId: rootId,
    canvasCourseId: null, syllabusNoteId: syllabusId,
  });
  await addStudyMaterials(userId, mapId, [noteId]);
  const source = await loadStudySource(userId, syllabusId);
  const anchor = anchorFromQuote(source, "Algorithms describe finite procedures for solving problems.");
  if (!anchor) throw new Error("Synthetic syllabus evidence is missing.");
  topic = topicSchema.parse({
    id: randomUUID(), name: "Algorithms", definition: anchor.quote, includes: "finite procedures",
    excludes: "", aliases: [], parentId: null, sources: [anchor], reviewed: true,
  });
  await saveStudyTopics(userId, mapId, { version: 1, topics: [topic] });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fixture`DELETE FROM app.login WHERE user_id IN (${userId}::uuid, ${otherUserId}::uuid)`;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await Promise.all([fixture.end(), sql.end()]);
});

describe("study map storage and durable jobs", () => {
  it.each(["PDF", "Markdown"])("finds an explicitly mapped %s through its extraction companion", async (mapped) => {
    const pair = await extractedPair();
    const mappedId = mapped === "PDF" ? pair.pdfId : pair.markdownId;
    const companionId = mapped === "PDF" ? pair.markdownId : pair.pdfId;
    await addStudyMaterials(userId, mapId, [mappedId]);
    const associations = await getNoteStudyMaps(userId, companionId);
    expect(associations).toHaveLength(1);
    expect(associations[0]).toMatchObject({ mapId, material: { noteId: mappedId } });
    expect(associations[0].material.currentHash).toBe((await loadStudySource(userId, mappedId)).hash);
  });

  it("prefers each extraction companion's direct membership when both are mapped", async () => {
    const pair = await extractedPair();
    await addStudyMaterials(userId, mapId, [pair.pdfId, pair.markdownId]);
    for (const id of [pair.pdfId, pair.markdownId]) {
      const associations = await getNoteStudyMaps(userId, id);
      expect(associations).toHaveLength(1);
      expect(associations[0]).toMatchObject({ mapId, material: { noteId: id } });
    }
  });

  it.each(["deleted original", "deleted extraction", "hidden original", "hidden extraction", "different owner"])(
    "does not infer map membership through a %s",
    async (inaccessible) => {
      const pair = await extractedPair();
      await addStudyMaterials(userId, mapId, [pair.pdfId]);
      if (inaccessible.startsWith("deleted")) {
        const id = inaccessible === "deleted original" ? pair.pdfId : pair.markdownId;
        await fixture`UPDATE app.notes SET deleted_at = NOW() WHERE note_id = ${id}::uuid AND user_id = ${userId}::uuid`;
      } else if (inaccessible.startsWith("hidden")) {
        const id = inaccessible === "hidden original" ? pair.pdfId : pair.markdownId;
        await fixture`DELETE FROM app.tree_items WHERE note_id = ${id}::uuid AND user_id = ${userId}::uuid`;
      }
      expect(await getNoteStudyMaps(inaccessible === "different owner" ? otherUserId : userId, pair.markdownId)).toEqual([]);
    },
  );

  it("does not turn ordinary note links or matching filenames into map membership", async () => {
    const linkedId = await makeNote(userId, "Lecture notes", "Algorithms are discussed here.");
    await fixture`INSERT INTO app.note_links (user_id, source_note_id, target_note_id)
      VALUES (${userId}::uuid, ${noteId}::uuid, ${linkedId}::uuid)`;
    expect(await getNoteStudyMaps(userId, linkedId)).toEqual([]);
  });

  it("keeps oversized materials readable and removable while rejecting classification", async () => {
    const oversizedId = await makeNote(userId, "Oversized synthetic lecture", "Algorithms ".repeat(30_000));
    await addStudyMaterials(userId, mapId, [oversizedId]);
    const snapshot = await getStudyMapSnapshot(userId, mapId);
    expect(snapshot.materials.find((item) => item.noteId === oversizedId)).toMatchObject({
      title: "Oversized synthetic lecture", status: "failed", excerpt: expect.stringContaining("Algorithms"),
    });
    const inspectable = await getNoteStudyMaps(userId, oversizedId);
    expect(inspectable).toHaveLength(1);
    expect(inspectable[0]).toMatchObject({ mapId, material: { noteId: oversizedId } });
    await expect(enqueueStudyJobs(userId, mapId, { kind: "classify", noteId: oversizedId }))
      .rejects.toMatchObject({ statusCode: 400 });
    await removeStudyMaterial(userId, mapId, oversizedId);
    expect((await getStudyMapSnapshot(userId, mapId)).materials.some((item) => item.noteId === oversizedId)).toBe(false);
  });

  it.each(["visible", "deleted"])("replaces automatic evidence when an identical extraction replaces a %s source", async (oldSource) => {
    const pair = await extractedPair();
    const paperText = [
      "# Examination 2025", "Sitting: Summer", "Syllabus version: 2026-2027", "Total marks: 20", "",
      "## Section A", "Answer all questions.", "",
      "### Question 1 [20 marks]", "Define algorithms. An algorithm is a finite procedure.",
    ].join("\n");
    await fixture`UPDATE app.notes SET content = ${paperText} WHERE note_id = ${pair.markdownId}::uuid`;
    await removeStudyMaterial(userId, mapId, noteId);
    await removeStudyMaterial(userId, mapId, syllabusId);
    noteId = pair.pdfId;
    await addStudyMaterials(userId, mapId, [noteId]);
    await enqueueStudyJobs(userId, mapId, { kind: "classify", noteId });
    await processNextStudyJob();
    await enqueueStudyJobs(userId, mapId, { kind: "paper", noteId });
    await processNextStudyJob();
    const original = await getStudyMapSnapshot(userId, mapId);
    const paper = original.papers.find((item) => item.noteId === noteId);
    if (!paper) throw new Error("The PDF's initial extraction was not analysed.");
    await saveStudyPaper(userId, mapId, { ...paper, reviewed: true });
    const previousSource = await loadStudySource(userId, noteId);
    expect(previousSource.noteId).toBe(pair.markdownId);
    expect((await searchStudyMaterials(userId, { mapId })).availableFacets.labels.some((item) => item.label === "definition")).toBe(true);

    const replacementId = await makeNote(userId, "Replacement lecture.md", paperText);
    await fixture`UPDATE app.notes SET extracted_from_note_id = ${noteId}::uuid, updated_at = NOW() + INTERVAL '1 second'
      WHERE note_id = ${replacementId}::uuid AND user_id = ${userId}::uuid`;
    if (oldSource === "deleted") {
      await fixture`UPDATE app.notes SET deleted_at = NOW() WHERE note_id = ${pair.markdownId}::uuid AND user_id = ${userId}::uuid`;
    }
    const source = await loadStudySource(userId, noteId);
    expect(source.hash).toBe(previousSource.hash);
    expect(source.noteId).toBe(replacementId);
    const stale = await getStudyMapSnapshot(userId, mapId);
    expect(stale.materials.find((item) => item.noteId === noteId)?.status).toBe("stale");
    if (oldSource === "deleted") expect(stale.papers.some((item) => item.noteId === noteId)).toBe(false);
    else expect(stale.papers.find((item) => item.noteId === noteId)?.reviewed).toBe(false);
    const staleSearch = await searchStudyMaterials(userId, { mapId });
    expect(staleSearch.results.find((item) => item.noteId === noteId)).toMatchObject({ stale: true, topics: [], labels: [] });
    expect(staleSearch.availableFacets.topics).toEqual([]);
    expect(staleSearch.availableFacets.labels).toEqual([]);

    expect(await enqueueStudyJobs(userId, mapId, { kind: "classify", noteId: null })).toBe(1);
    expect(await enqueueStudyJobs(userId, mapId, { kind: "paper", noteId: null })).toBe(1);
    await processNextStudyJob();
    await processNextStudyJob();
    const refreshed = await getStudyMapSnapshot(userId, mapId);
    const material = refreshed.materials.find((item) => item.noteId === noteId);
    expect(material?.status).toBe("classified");
    expect(material?.associations.length).toBeGreaterThan(0);
    expect(material?.associations.flatMap((item) => item.evidence).every((item) => item.anchor.noteId === replacementId)).toBe(true);
    const refreshedPaper = refreshed.papers.find((item) => item.noteId === noteId);
    expect(refreshedPaper?.reviewed).toBe(false);
    expect(refreshedPaper?.structure.questions.every((item) => item.source.noteId === replacementId)).toBe(true);
    expect(refreshedPaper?.structure.sections.every((item) => item.source === null || item.source.noteId === replacementId)).toBe(true);
  });

  it("keeps manual corrections valid when the canonical extraction changes with identical field and text", async () => {
    const pair = await extractedPair();
    noteId = pair.pdfId;
    await addStudyMaterials(userId, mapId, [noteId]);
    await enqueueStudyJobs(userId, mapId, { kind: "classify", noteId });
    await processNextStudyJob();
    const correction = await correctionInput();
    await reviewStudyMaterial(userId, mapId, correction);
    const previousSource = await loadStudySource(userId, noteId);
    const replacementId = await makeNote(userId, "Replacement lecture.md", previousSource.text);
    await fixture`UPDATE app.notes SET extracted_from_note_id = ${noteId}::uuid, updated_at = NOW() + INTERVAL '1 second'
      WHERE note_id = ${replacementId}::uuid AND user_id = ${userId}::uuid`;
    const source = await loadStudySource(userId, noteId);
    expect(source.noteId).toBe(replacementId);
    expect(source.hash).toBe(correction.sourceHash);
    const snapshot = await getStudyMapSnapshot(userId, mapId);
    const material = snapshot.materials.find((item) => item.noteId === noteId);
    expect(material).toMatchObject({ status: "stale", kind: correction.kind, labels: correction.labels });
    if (!material) throw new Error("The PDF material is missing.");
    expect(effectiveAssociations(material, snapshot.map.taxonomyVersion)).toContainEqual(expect.objectContaining({
      topicId: topic.id, relevance: "core", status: "accepted", origin: "manual",
    }));
    expect((await searchStudyMaterials(userId, { mapId, label: correction.labels[0] })).results.find((item) => item.noteId === noteId))
      .toMatchObject({ labels: correction.labels, topics: [expect.objectContaining({ id: topic.id, status: "accepted" })] });
    await expect(reviewStudyMaterial(userId, mapId, correction)).resolves.toBeUndefined();
  });

  it("keeps reads, corrections, materials and job requests within their owner", async () => {
    await expect(getStudyMapSnapshot(otherUserId, mapId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(addStudyMaterials(userId, mapId, [otherNoteId])).rejects.toMatchObject({ statusCode: 404 });
    await expect(reviewStudyMaterial(otherUserId, mapId, await correctionInput())).rejects.toMatchObject({ statusCode: 404 });
    await expect(enqueueStudyJobs(otherUserId, mapId, { kind: "classify", noteId })).rejects.toMatchObject({ statusCode: 404 });
    await expect(enqueueStudyJobs(userId, mapId, { kind: "classify", noteId: otherNoteId })).rejects.toMatchObject({ statusCode: 404 });
    expect((await getStudyMapSnapshot(userId, mapId)).materials.map((material) => material.noteId))
      .toEqual(expect.arrayContaining([noteId, syllabusId]));
    expect(await fixture`SELECT id FROM app.study_jobs WHERE map_id = ${mapId}::uuid`).toHaveLength(0);
  });

  it("rejects stale corrections after the source changes", async () => {
    const original = await correctionInput();
    await reviewStudyMaterial(userId, mapId, original);
    const previous = (await storedMaterial()).overrides;
    await fixture`UPDATE app.notes SET content = 'Changed algorithms lecture', updated_at = NOW() WHERE note_id = ${noteId}::uuid`;
    await expect(reviewStudyMaterial(userId, mapId, original)).rejects.toMatchObject({ statusCode: 409 });
    expect((await storedMaterial()).overrides).toEqual(previous);
    expect((await getStudyMapSnapshot(userId, mapId)).materials.find((material) => material.noteId === noteId)?.status).toBe("stale");
  });

  it("preserves manual corrections when classification is explicitly rerun", async () => {
    await reviewStudyMaterial(userId, mapId, await correctionInput());
    const overrides = (await storedMaterial()).overrides;
    expect(await enqueueStudyJobs(userId, mapId, { kind: "classify", noteId })).toBe(1);
    expect(await processNextStudyJob()).toBe(true);
    expect((await latestJob()).state).toBe("completed");
    expect((await storedMaterial()).overrides).toEqual(overrides);
    const snapshot = await getStudyMapSnapshot(userId, mapId);
    const material = snapshot.materials.find((item) => item.noteId === noteId);
    expect(material).toMatchObject({ kind: "worked_example", labels: ["exam revision"], status: "classified" });
    if (!material) throw new Error("Classified material is missing.");
    expect(effectiveAssociations(material, snapshot.map.taxonomyVersion)).toContainEqual(expect.objectContaining({
      topicId: topic.id, relevance: "core", status: "accepted", origin: "manual",
    }));
  });

  it("keeps the saved board when another tab submits an older board version", async () => {
    const board = {
      ...emptyBoard(),
      scene: boardScene([textSceneElement("annotation", "Keep the definition beside its source."), embeddableSceneElement("note", noteId)]),
      placements: [{ id: `note:${noteId}`, x: 120, y: 80, pinned: true, topicId: null }],
    };
    expect(await saveStudyBoard(userId, mapId, { version: 0, board })).toBe(1);
    const newerScene = boardScene([textSceneElement("new-annotation", "A newer layout draft.")]);
    await expect(saveStudyBoard(userId, mapId, { version: 0, board: { ...emptyBoard(), scene: newerScene } }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect((await getStudyMap(userId, mapId)).board).toEqual(board);
  });

  it("round-trips native annotations and canonical note and topic embeds", async () => {
    const scene = boardScene([
      textSceneElement("annotation", "Algorithms are finite procedures."),
      embeddableSceneElement("note", noteId),
      embeddableSceneElement("topic", topic.id),
    ]);
    const board = { ...emptyBoard(), scene };

    expect(await saveStudyBoard(userId, mapId, { version: 0, board })).toBe(1);
    expect((await getStudyMap(userId, mapId)).board.scene).toEqual(scene);
    expect((await getStudyMapSnapshot(userId, mapId)).map.board.scene).toEqual(scene);
  });

  it.each(["other owner", "nonmember", "hidden", "import cache", "folder"])(
    "rejects board embeds for an unavailable %s note",
    async (kind) => {
      let targetId: string;
      if (kind === "other owner") {
        targetId = otherNoteId;
      } else {
        targetId = await makeNote(userId, `Synthetic ${kind}`, kind === "folder" ? "" : "An available-looking source.", kind === "folder");
        if (kind !== "nonmember" && kind !== "folder") await addStudyMaterials(userId, mapId, [targetId]);
        if (kind === "hidden") {
          await fixture`DELETE FROM app.tree_items WHERE user_id = ${userId}::uuid AND note_id = ${targetId}::uuid`;
        } else if (kind === "import cache") {
          await fixture`UPDATE app.notes SET is_import_cache_source = TRUE WHERE user_id = ${userId}::uuid AND note_id = ${targetId}::uuid`;
        } else if (kind === "folder") {
          await fixture`INSERT INTO app.study_materials (map_id, user_id, note_id)
            VALUES (${mapId}::uuid, ${userId}::uuid, ${targetId}::uuid)`;
        }
      }

      const board = { ...emptyBoard(), scene: boardScene([embeddableSceneElement("note", targetId)]) };
      await expect(saveStudyBoard(userId, mapId, { version: 0, board })).rejects.toMatchObject({ statusCode: 400 });
    },
  );

  it("prunes removed and deleted note embeds from both map reads and repairs surviving scene bindings", async () => {
    const deletedNoteId = await makeNote(userId, "Deleted synthetic source", "This source will be deleted.", false, rootId);
    await addStudyMaterials(userId, mapId, [deletedNoteId]);
    const rectangle: BoardSceneElement = {
      ...sceneBase("shape"),
      type: "rectangle",
      boundElements: [{ id: "annotation", type: "text" }, { id: "arrow", type: "arrow" }],
    };
    const annotation = textSceneElement("annotation", "Study note", "shape");
    const removedEmbed = embeddableSceneElement("note", noteId);
    const deletedEmbed = embeddableSceneElement("note", deletedNoteId);
    const topicEmbed = embeddableSceneElement("topic", topic.id);
    const arrow: BoardSceneElement = {
      ...sceneBase("arrow"),
      type: "arrow",
      points: [[0, 0], [40, 30]],
      lastCommittedPoint: null,
      startBinding: { elementId: removedEmbed.id, focus: 0, gap: 4 },
      endBinding: { elementId: "shape", focus: 0, gap: 4 },
      startArrowhead: null,
      endArrowhead: "arrow",
      elbowed: false,
    };
    const scene = boardScene([rectangle, annotation, arrow, removedEmbed, deletedEmbed, topicEmbed]);
    await saveStudyBoard(userId, mapId, { version: 0, board: { ...emptyBoard(), scene } });

    await removeStudyMaterial(userId, mapId, noteId);
    await fixture`UPDATE app.notes SET deleted_at = NOW() WHERE user_id = ${userId}::uuid AND note_id = ${deletedNoteId}::uuid`;

    const map = await getStudyMap(userId, mapId);
    const snapshot = await getStudyMapSnapshot(userId, mapId);
    for (const returnedScene of [map.board.scene, snapshot.map.board.scene]) {
      expect(returnedScene).toBeDefined();
      const elements = returnedScene?.elements ?? [];
      expect(elements.map((element) => element.id)).toEqual(["shape", "annotation", "arrow", topicEmbed.id]);
      const byId = new Map(elements.map((element) => [element.id, element]));
      expect(byId.get("shape")?.boundElements).toEqual([{ id: "annotation", type: "text" }, { id: "arrow", type: "arrow" }]);
      expect(byId.get("annotation")).toMatchObject({ type: "text", containerId: "shape" });
      expect(byId.get("arrow")).toMatchObject({
        type: "arrow", startBinding: null, endBinding: { elementId: "shape", focus: 0, gap: 4 },
      });
    }
    const [stored] = await fixture<Array<{ board: { scene: StudyBoardScene } }>>`
      SELECT board FROM app.study_maps WHERE user_id = ${userId}::uuid AND id = ${mapId}::uuid
    `;
    expect(stored.board.scene.elements.map((element) => element.id)).toEqual(scene.elements.map((element) => element.id));
  });

  it("persists valid deleted scene-element tombstones without reviving them", async () => {
    const tombstone: BoardSceneElement = {
      ...embeddableSceneElement("note", noteId),
      isDeleted: true,
    };
    const scene = boardScene([textSceneElement("annotation", "Keep this note off the board."), tombstone]);
    await saveStudyBoard(userId, mapId, { version: 0, board: { ...emptyBoard(), scene } });

    for (const returnedScene of [
      (await getStudyMap(userId, mapId)).board.scene,
      (await getStudyMapSnapshot(userId, mapId)).map.board.scene,
    ]) {
      expect(returnedScene?.elements.find((element) => element.id === tombstone.id)).toMatchObject({
        type: "embeddable", isDeleted: true, customData: { studyRef: { kind: "note", id: noteId } },
      });
    }
  });

  it("rejects a source edited during processing and requires a manual retry", async () => {
    const map = await getStudyMap(userId, mapId);
    await updateStudyMap(userId, mapId, { ...map, academicYear: map.academicYear, version: map.version, autoClassify: true });
    await enqueueStudyJobs(userId, mapId, { kind: "classify", noteId });
    await duringClassification(async () => {
      await fixture`UPDATE app.notes SET content = 'Algorithms now have different source text.', updated_at = NOW() WHERE note_id = ${noteId}::uuid`;
    });
    expect(await latestJob()).toMatchObject({ state: "failed", error: expect.stringContaining("source changed") });
    expect(await storedMaterial()).toMatchObject({ source_hash: "", classification: null });
    expect(await enqueueStudyJobs(userId, mapId, { kind: "classify", noteId }, { automatic: true })).toBe(0);
    expect(await enqueueStudyJobs(userId, mapId, { kind: "classify", noteId })).toBe(1);
    await processNextStudyJob();
    expect((await latestJob()).state).toBe("completed");
    expect((await storedMaterial()).source_hash).toBe((await loadStudySource(userId, noteId)).hash);
  });

  it("rejects a result when the topic meaning changes during processing", async () => {
    await enqueueStudyJobs(userId, mapId, { kind: "classify", noteId });
    await duringClassification(async () => {
      const map = await getStudyMap(userId, mapId);
      await saveStudyTopics(userId, mapId, { version: map.version, topics: [{ ...topic, excludes: "sorting" }] });
    });
    expect(await latestJob()).toMatchObject({ state: "failed", error: expect.stringContaining("map or topics changed") });
    expect(await storedMaterial()).toMatchObject({ source_hash: "", classification: null });
  });

  it("invalidates approved topics, corrections, papers and alias facets when only syllabus evidence changes", async () => {
    const initialMap = await getStudyMap(userId, mapId);
    topic = { ...topic, aliases: ["ProcedureTaxonomyAlias"] };
    await saveStudyTopics(userId, mapId, { version: initialMap.version, topics: [topic] });
    await enqueueStudyJobs(userId, mapId, { kind: "classify", noteId });
    await processNextStudyJob();
    const correction = await correctionInput();
    await reviewStudyMaterial(userId, mapId, correction);
    const overrides = (await storedMaterial()).overrides;
    const paper = await extractedPaper();
    await saveStudyPaper(userId, mapId, { ...paper, reviewed: true });
    const before = await getStudyMapSnapshot(userId, mapId);
    expect(before.papers.find((item) => item.noteId === paper.noteId)?.reviewed).toBe(true);
    const searchable = await searchStudyMaterials(userId, { q: "ProcedureTaxonomyAlias", mapId });
    expect(searchable.results.some((item) => item.noteId === noteId)).toBe(true);
    expect(searchable.availableFacets.topics.some((item) => item.id === topic.id)).toBe(true);

    await fixture`UPDATE app.notes SET content = '# Algorithms\n\nAlgorithms now have a revised definition.', updated_at = NOW()
      WHERE note_id = ${syllabusId}::uuid AND user_id = ${userId}::uuid`;
    const after = await getStudyMapSnapshot(userId, mapId);
    expect(after.map.taxonomyVersion).toBe(before.map.taxonomyVersion);
    expect(after.map.version).toBe(before.map.version);
    expect(after.map.topics.find((item) => item.id === topic.id)?.reviewed).toBe(false);
    expect(after.materials.find((item) => item.noteId === noteId)).toMatchObject({ status: "stale", taxonomyEvidenceStale: true });
    expect(after.papers.find((item) => item.noteId === paper.noteId)?.reviewed).toBe(false);
    const staleSearch = await searchStudyMaterials(userId, { q: "ProcedureTaxonomyAlias", mapId });
    expect(staleSearch.total).toBe(0);
    expect(staleSearch.availableFacets.topics.some((item) => item.id === topic.id)).toBe(false);
    expect(staleSearch.availableFacets.labels).toEqual([]);
    expect((await searchStudyMaterials(userId, { mapId })).results.find((item) => item.noteId === noteId))
      .toMatchObject({ stale: true, topics: [], labels: [] });

    const classify = vi.spyOn(classification, "classifyStudySource");
    await expect(enqueueStudyJobs(userId, mapId, { kind: "classify", noteId })).rejects.toMatchObject({ statusCode: 409 });
    expect(classify).not.toHaveBeenCalled();
    await expect(reviewStudyMaterial(userId, mapId, correction)).rejects.toMatchObject({ statusCode: 409 });
    expect((await storedMaterial()).overrides).toEqual(overrides);
    await expect(saveStudyPaper(userId, mapId, { ...paper, reviewed: true })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects publication when a topic's syllabus source is edited during provider work", async () => {
    const before = await getStudyMap(userId, mapId);
    await enqueueStudyJobs(userId, mapId, { kind: "classify", noteId });
    await duringClassification(async () => {
      await fixture`UPDATE app.notes SET content = 'The syllabus definition changed during processing.', updated_at = NOW()
        WHERE note_id = ${syllabusId}::uuid AND user_id = ${userId}::uuid`;
    });
    const job = await latestJob();
    expect(job.state).toBe("failed");
    expect(job.error).toMatch(/topic source changed/i);
    expect(job.error).not.toMatch(/definition changed during processing/);
    expect((await getStudyMap(userId, mapId)).taxonomyVersion).toBe(before.taxonomyVersion);
    expect(await storedMaterial()).toMatchObject({ source_hash: "", classification: null });
  });

  it.each(["another section's rule", "a quoted answer-count mismatch"])("rejects manual paper approval using %s", async (invalid) => {
    const paper = await extractedPaper([
      "# Examination 2025", "Sitting: Summer", "Syllabus version: 2026-2027", "Total marks: 40", "",
      "## Section A", "Answer 1 of 2 questions.", "",
      "### Question 1 [10 marks]", "Describe algorithms.", "",
      "### Question 2 [10 marks]", "Compare finite procedures.", "",
      "## Section B", "Answer all questions.", "",
      "### Question 3 [10 marks]", "Explain algorithm steps.", "",
      "### Question 4 [10 marks]", "Define an algorithm.",
    ].join("\n"));
    await saveStudyPaper(userId, mapId, { ...paper, reviewed: true });
    const structure = structuredClone(paper.structure);
    if (invalid === "another section's rule") {
      structure.sections[0].source = structure.sections[1].source;
      structure.sections[0].instructions = structure.sections[1].instructions;
    } else structure.sections[0].answerCount = 2;
    await expect(saveStudyPaper(userId, mapId, { ...paper, structure, reviewed: true }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect((await getStudyMapSnapshot(userId, mapId)).papers.find((item) => item.noteId === paper.noteId))
      .toMatchObject({ reviewed: true, structure: paper.structure });
  });

  it.each(["question marks", "the stated total"])("rejects approving %s that are not supported by the paper source", async (changed) => {
    const paper = await extractedPaper();
    await saveStudyPaper(userId, mapId, { ...paper, reviewed: true });
    const structure = structuredClone(paper.structure);
    if (changed === "question marks") structure.questions[0].marks = 30;
    else structure.statedTotalMarks = 30;
    await expect(saveStudyPaper(userId, mapId, { ...paper, structure, reviewed: true }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect((await getStudyMapSnapshot(userId, mapId)).papers.find((item) => item.noteId === paper.noteId))
      .toMatchObject({ reviewed: true, structure: paper.structure });
  });

  it.each(["unknown topic", "foreign source"])("rejects classification evidence with an %s", async (kind) => {
    const original = classification.classifyStudySource;
    vi.spyOn(classification, "classifyStudySource").mockImplementation(async (...args) => {
      const result = await original(...args);
      const association = result.associations[0];
      if (!association) throw new Error("Synthetic classification has no topic evidence.");
      if (kind === "unknown topic") association.topicId = randomUUID();
      else association.evidence[0].anchor.noteId = otherNoteId;
      return result;
    });
    await enqueueStudyJobs(userId, mapId, { kind: "classify", noteId });
    await processNextStudyJob();
    expect(await latestJob()).toMatchObject({ state: "failed", error: expect.stringContaining("could not be verified") });
    expect(await storedMaterial()).toMatchObject({ source_hash: "", classification: null });
  });

  it("keeps provider response bodies out of the stored job error", async () => {
    vi.spyOn(classification, "classifyStudySource").mockRejectedValue(new Error("Synthetic provider body: Authorization Bearer private-test-token"));
    await enqueueStudyJobs(userId, mapId, { kind: "classify", noteId });
    await processNextStudyJob();
    const job = await latestJob();
    expect(job.state).toBe("failed");
    expect(job.error).toMatch(/Study processing failed/);
    expect(job.error).not.toMatch(/Synthetic provider body|Authorization|private-test-token/);
  });

  it("stores an extracted paper with current source anchors and leaves it unreviewed", async () => {
    noteId = await makeNote(userId, "Past paper 2025", [
      "# Examination 2025", "Sitting: Summer", "Syllabus version: 2026-2027", "Total marks: 20", "",
      "## Section A", "Answer all questions.", "",
      "### Question 1 [20 marks]", "Explain algorithms and finite procedures.",
    ].join("\n"), false, rootId);
    await addStudyMaterials(userId, mapId, [noteId]);
    expect(await enqueueStudyJobs(userId, mapId, { kind: "paper", noteId })).toBe(1);
    await processNextStudyJob();
    expect((await latestJob()).state).toBe("completed");
    const paper = (await getStudyMapSnapshot(userId, mapId)).papers.find((item) => item.noteId === noteId);
    expect(paper).toMatchObject({ reviewed: false, sourceHash: (await loadStudySource(userId, noteId)).hash });
    expect(paper?.structure.questions[0]).toMatchObject({ marks: 20, topicIds: [topic.id], source: { noteId } });
  });

  it("preserves a saved paper review when an older extraction finishes afterwards", async () => {
    const paper = await extractedPaper();
    const original = generation.extractStudyPaper;
    let release = () => {};
    let announce = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { announce = resolve; });
    vi.spyOn(generation, "extractStudyPaper").mockImplementation(async (...args) => {
      announce();
      await gate;
      return original(...args);
    });
    await enqueueStudyJobs(userId, mapId, { kind: "paper", noteId: paper.noteId });
    const processing = processNextStudyJob();
    const corrected = structuredClone(paper.structure);
    corrected.questions[0].style = "definition";
    try {
      await Promise.race([
        started,
        processing.then(() => { throw new Error("The paper job never reached the provider boundary."); }),
      ]);
      await saveStudyPaper(userId, mapId, { ...paper, structure: corrected, reviewed: true });
      expect(await latestJob(paper.noteId)).toMatchObject({ state: "failed", lease_token: null });
    } finally {
      release();
      await processing;
    }
    expect((await getStudyMapSnapshot(userId, mapId)).papers.find((item) => item.noteId === paper.noteId))
      .toMatchObject({ reviewed: true, structure: corrected });
    expect((await latestJob(paper.noteId)).state).toBe("failed");
  });

  it("keeps a removal tombstone through automatic folder refresh and stops publication", async () => {
    const map = await getStudyMap(userId, mapId);
    await updateStudyMap(userId, mapId, { ...map, academicYear: map.academicYear, version: map.version, autoClassify: true });
    await enqueueStudyJobs(userId, mapId, { kind: "classify", noteId });
    await duringClassification(() => removeStudyMaterial(userId, mapId, noteId));
    await syncStudyMaterials(userId, mapId);
    await reconcileStudyMaps();
    expect((await getStudyMapSnapshot(userId, mapId)).materials.some((material) => material.noteId === noteId)).toBe(false);
    expect(await latestJob()).toMatchObject({ state: "failed", lease_token: null });
    expect(await storedMaterial()).toMatchObject({ classification: null });
    const [{ excluded }] = await fixture<{ excluded: boolean }[]>`SELECT excluded FROM app.study_materials WHERE map_id = ${mapId}::uuid AND note_id = ${noteId}::uuid`;
    expect(excluded).toBe(true);
  });

  it("deduplicates active requests and recovers an expired lease only within the attempt limit", async () => {
    expect(await Promise.all([
      enqueueStudyJobs(userId, mapId, { kind: "classify", noteId }),
      enqueueStudyJobs(userId, mapId, { kind: "classify", noteId }),
    ])).toEqual(expect.arrayContaining([1, 0]));
    await fixture`UPDATE app.study_jobs SET state = 'running', attempts = 1, lease_token = ${randomUUID()}::uuid,
      lease_until = NOW() - INTERVAL '1 minute' WHERE map_id = ${mapId}::uuid AND note_id = ${noteId}::uuid`;
    expect(await processNextStudyJob()).toBe(true);
    expect(await latestJob()).toMatchObject({ state: "completed", attempts: 2, lease_token: null });
    await enqueueStudyJobs(userId, mapId, { kind: "classify", noteId });
    const exhausted = await latestJob();
    await fixture`UPDATE app.study_jobs SET state = 'running', attempts = 3, lease_token = ${randomUUID()}::uuid,
      lease_until = NOW() - INTERVAL '1 minute' WHERE id = ${exhausted.id}::uuid`;
    expect(await processNextStudyJob()).toBe(false);
    expect(await latestJob()).toMatchObject({ state: "failed", attempts: 3, lease_token: null });
  });

  it("rejects further jobs at the user's limit without restricting a different owner", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 100; index += 1) ids.push(await makeNote(userId, `Synthetic ${index}`, "Algorithms are finite procedures."));
    await addStudyMaterials(userId, mapId, ids);
    expect(await enqueueStudyJobs(userId, mapId, { kind: "classify", noteId: null })).toBe(50);
    expect(await enqueueStudyJobs(userId, mapId, { kind: "classify", noteId: null })).toBe(50);
    await expect(enqueueStudyJobs(userId, mapId, { kind: "classify", noteId: ids[99] })).rejects.toMatchObject({ statusCode: 400 });
    const otherMap = await createStudyMap(otherUserId, {
      name: "Other module", academicYear: "2026-2027", rootNoteId: null, canvasCourseId: null, syllabusNoteId: otherNoteId,
    });
    expect(await enqueueStudyJobs(otherUserId, otherMap, { kind: "taxonomy", noteId: null })).toBe(1);
    const [{ count }] = await fixture<{ count: number }[]>`SELECT count(*)::int AS count FROM app.study_jobs WHERE user_id = ${userId}::uuid AND state IN ('pending', 'running')`;
    expect(count).toBe(100);
  });
});
