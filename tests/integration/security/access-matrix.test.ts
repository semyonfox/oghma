import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import postgres from "postgres";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireE2EDatabaseUrl } from "../helpers/env";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), token: "", enqueue: vi.fn(), limited: vi.fn(), consumeGrant: vi.fn(), after: vi.fn<(callback: () => Promise<void>) => void>(), generate: vi.fn(), objects: new Map<string, string>() }));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: mocks.after }));
vi.mock("@/lib/quiz/generate-background", () => ({ generateBatch: mocks.generate }));
vi.mock("@/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "session" && mocks.token ? { value: mocks.token } : undefined }) }));
vi.mock("@/lib/api-error", async (original) => ({
  ...await original<typeof import("@/lib/api-error")>(),
  requireAuth: mocks.auth,
}));
vi.mock("@/lib/queue", () => ({ enqueueNoteReindexJob: mocks.enqueue, enqueueCanvasJob: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limiter", () => ({ checkRateLimit: mocks.limited, getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/cache", async (original) => ({
  ...await original<typeof import("@/lib/cache")>(),
  cacheGet: async () => null, cacheSet: async () => undefined, cacheInvalidate: async () => undefined,
}));
vi.mock("@/lib/rag/indexing", () => ({ replaceNoteEmbeddings: vi.fn().mockResolvedValue(1) }));
vi.mock("@/lib/auth/mobile", async (original) => ({
  ...await original<typeof import("@/lib/auth/mobile")>(),
  mobileAppLinksReady: () => true, consumeMobileAuthGrant: mocks.consumeGrant,
}));
vi.mock("@/lib/rag/embeddings", () => ({ embedText: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/qdrant", () => ({ searchChunkVectors: vi.fn().mockResolvedValue([]), setChunkVectorsSearchable: vi.fn().mockResolvedValue(undefined), deleteChunkVectors: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/storage/init", () => ({ getStorageProvider: () => ({
  hasObject: async () => true,
  putObject: async (key: string, body: string) => { mocks.objects.set(key, body); },
  getObject: async (key: string) => mocks.objects.get(key) ?? null,
  deleteObject: async () => undefined,
  getObjectStream: async () => ({ body: Readable.from([Buffer.from("fixture asset")]), contentType: "image/png" }),
}) }));

import sql from "@/database/pgsql";
import { POST as exchangeMobile } from "@/app/api/auth/mobile/exchange/route";
import { reindexNote } from "@/lib/rag/note-reindex";
import { requireAnalyticsAdmin } from "@/lib/marketing/admin";
import { RATE_LIMITS } from "@/lib/rate-limit-config";
import { generateJWTToken, validateSession } from "@/lib/auth/session";
import { POST as logout } from "@/app/api/auth/logout/route";
import { createChatTools } from "@/lib/chat/build-stream";
import { GET as attachment, POST as upload } from "@/app/api/upload/route";
import { POST as trashAction } from "@/app/api/trash/route";
import { GET as settings, POST as saveSettings } from "@/app/api/settings/route";
import { GET as avatar } from "@/app/api/auth/avatar/route";
import { GET as avatarImage } from "@/app/api/auth/avatar/image/route";
import { POST as studyJobs } from "@/app/api/study-maps/[id]/jobs/route";
import { GET as vaultStatus } from "@/app/api/vault/status/route";
import { DELETE as vaultCancel } from "@/app/api/vault/jobs/[jobId]/cancel/route";
import { POST as cancelGeneration } from "@/app/api/chat/generations/[id]/cancel/route";
import { GET as streamGeneration } from "@/app/api/chat/generations/[id]/stream/route";
import { POST as approveAction } from "@/app/api/chat/actions/[id]/route";
import { POST as startQuiz } from "@/app/api/quiz/sessions/route";
import { GET as card } from "@/app/api/quiz/cards/[id]/route";
import { POST as answer } from "@/app/api/quiz/sessions/[id]/answer/route";
import { moveSubtreeToTrash } from "@/lib/notes/storage/note-lifecycle";
import { ApiError } from "@/lib/api-error";
import * as notes from "@/app/api/notes/route";
import * as note from "@/app/api/notes/[id]/route";
import { GET as backlinks } from "@/app/api/notes/[id]/backlinks/route";
import { GET as path } from "@/app/api/notes/[id]/path/route";
import { GET as offline } from "@/app/api/notes/[id]/offline/route";
import { GET as assets } from "@/app/api/notes/[id]/assets/route";
import { GET as tree } from "@/app/api/tree/children/route";
import { POST as move } from "@/app/api/tree/route";
import { GET as trash } from "@/app/api/trash/route";
import { GET as annotations } from "@/app/api/pdf/annotations/route";
import { GET as sessions } from "@/app/api/chat/sessions/route";
import { GET as chatSession } from "@/app/api/chat/sessions/[id]/route";
import { GET as quizSession } from "@/app/api/quiz/sessions/[id]/route";
import { GET as studyMap } from "@/app/api/study-maps/[id]/route";
import { GET as assignment } from "@/app/api/assignments/[id]/route";
import { PATCH as timeBlock } from "@/app/api/time-blocks/[id]/route";
import { GET as search } from "@/app/api/search/route";
import { GET as globalSearch } from "@/app/api/global-search/route";
import { GET as admin } from "@/app/api/admin/analytics/route";
import { GET as calendar } from "@/app/api/calendar/ical/[token]/route";
import { resolveSession } from "@/lib/chat/session";
import { hydrateOwnedNoteChunks } from "@/lib/rag/owned-note-chunks";

const fixture = postgres(requireE2EDatabaseUrl(), { max: 2 });
let otherNoteId: string;
let otherFolderId: string;
let importJobId: string;
let owner: string;
let other: string;
let noteId: string;
let folderId: string;
let sessionId: string;
let quizId: string;
let mapId: string;
let assignmentId: string;
let blockId: string;
let chunkId: string;
let token: string;
let generationId: string;
let messageId: string;
let actionId: string;
let cardId: string;
let jobId: string;
const privateText = "private access matrix lecture";
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (url = "/", method = "GET", body?: unknown) => new NextRequest(`http://localhost${url}`, {
  method, headers: { origin: "http://localhost", "content-type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

beforeEach(async () => {
  mocks.after.mockClear();
  mocks.generate.mockReset().mockResolvedValue(0);
  mocks.enqueue.mockReset().mockResolvedValue(undefined);
  mocks.limited.mockReset().mockResolvedValue(null);
  vi.stubEnv("STUDY_CLASSIFIER_PROVIDER", "mock");
  mocks.objects.clear();
  mocks.token = "";
  otherNoteId = randomUUID(); otherFolderId = randomUUID(); importJobId = randomUUID();
  generationId = randomUUID(); messageId = randomUUID(); actionId = randomUUID(); cardId = randomUUID(); jobId = randomUUID();
  owner = randomUUID(); other = randomUUID(); noteId = randomUUID(); folderId = randomUUID();
  sessionId = randomUUID(); quizId = randomUUID(); mapId = randomUUID(); assignmentId = randomUUID();
  blockId = randomUUID(); chunkId = randomUUID(); token = randomUUID();
  await fixture`INSERT INTO app.login (user_id, email, hashed_password, email_verified, is_active, calendar_export_token)
    VALUES (${owner}::uuid, ${`${owner}@example.test`}, 'unused', true, true, ${token}::uuid),
      (${other}::uuid, ${`${other}@example.test`}, 'unused', true, true, NULL)`;
  await fixture`INSERT INTO app.notes (note_id, user_id, title, content, is_folder)
    VALUES (${noteId}::uuid, ${owner}::uuid, ${privateText}, ${privateText}, false),
      (${folderId}::uuid, ${owner}::uuid, 'private folder', '', true),
      (${otherNoteId}::uuid, ${other}::uuid, 'other private lecture', 'other private lecture', false),
      (${otherFolderId}::uuid, ${other}::uuid, 'other folder', '', true)`;
  await fixture`INSERT INTO app.tree_items (user_id, note_id, parent_id)
    VALUES (${owner}::uuid, ${noteId}::uuid, NULL), (${owner}::uuid, ${folderId}::uuid, NULL),
      (${other}::uuid, ${otherNoteId}::uuid, NULL), (${other}::uuid, ${otherFolderId}::uuid, NULL)`;
  await fixture`INSERT INTO app.attachments (note_id, user_id, filename, s3_key)
    VALUES (${noteId}::uuid, ${owner}::uuid, 'fixture.png', 'fixture.png')`;
  await fixture`INSERT INTO app.pdf_annotations (note_id, user_id, annotation_data)
    VALUES (${noteId}::uuid, ${owner}::uuid, ${fixture.json({ text: privateText })})`;
  await fixture`INSERT INTO app.chunks (id, document_id, user_id, text)
    VALUES (${chunkId}::uuid, ${noteId}::uuid, ${owner}::uuid, ${privateText})`;
  await fixture`INSERT INTO app.chat_sessions (id, user_id, title) VALUES (${sessionId}::uuid, ${owner}::uuid, ${privateText})`;
  await fixture`INSERT INTO app.chat_messages (id, session_id, role, content)
    VALUES (${messageId}::uuid, ${sessionId}::uuid, 'assistant', ${privateText})`;
  await fixture`INSERT INTO app.chat_generations (id, session_id, user_id, status, request_payload)
    VALUES (${generationId}::uuid, ${sessionId}::uuid, ${owner}::uuid, 'completed', '{}'::jsonb)`;
  await fixture`INSERT INTO app.chat_tool_actions (id, session_id, user_id, session_version, tool_name, input, expires_at)
    VALUES (${actionId}::uuid, ${sessionId}::uuid, ${owner}::uuid, 0, 'renameNote',
      ${fixture.json({ noteId, newTitle: 'renamed fixture' })}, NOW() + INTERVAL '1 hour')`;
  const questionId = randomUUID();
  await fixture`INSERT INTO app.quiz_questions (id, user_id, note_id, chunk_id, question_type, bloom_level, question_text, correct_answer)
    VALUES (${questionId}::uuid, ${owner}::uuid, ${noteId}::uuid, ${chunkId}::uuid, 'fill_in', 1, ${privateText}, 'answer')`;
  await fixture`INSERT INTO app.quiz_cards (id, user_id, question_id) VALUES (${cardId}::uuid, ${owner}::uuid, ${questionId}::uuid)`;
  await fixture`INSERT INTO app.canvas_import_jobs (id, user_id, type, status)
    VALUES (${jobId}::uuid, ${owner}::uuid, 'vault-export', 'queued'),
      (${importJobId}::uuid, ${owner}::uuid, 'vault-import', 'queued')`;
  mocks.objects.set(`settings/${owner}/settings.json`, JSON.stringify({ firstName: privateText, avatarKey: `avatars/${owner}/fixture.png` }));
  mocks.objects.set(`settings/${other}/settings.json`, JSON.stringify({ firstName: 'other', avatarKey: `avatars/${other}/fixture.png` }));
  await fixture`INSERT INTO app.quiz_sessions (id, user_id, filter_type, total_questions, card_ids) VALUES (${quizId}::uuid, ${owner}::uuid, 'all', 1, ${fixture.json([cardId])})`;
  await fixture`INSERT INTO app.study_maps (id, user_id, name, academic_year, syllabus_note_id)
    VALUES (${mapId}::uuid, ${owner}::uuid, ${privateText}, '2026/2027', ${noteId}::uuid)`;
  await fixture`INSERT INTO app.study_materials (map_id, user_id, note_id) VALUES (${mapId}::uuid, ${owner}::uuid, ${noteId}::uuid)`;
  await fixture`INSERT INTO app.assignments (id, user_id, title, due_at)
    VALUES (${assignmentId}::uuid, ${owner}::uuid, ${privateText}, NOW())`;
  await fixture`INSERT INTO app.time_blocks (id, user_id, title, starts_at, ends_at)
    VALUES (${blockId}::uuid, ${owner}::uuid, ${privateText}, NOW(), NOW() + INTERVAL '1 hour')`;
});
afterEach(async () => {
  // quiz_sessions has no login foreign key in the baseline
  await fixture`DELETE FROM app.note_deletion_cleanup_tasks WHERE user_id IN (${owner}::uuid, ${other}::uuid)`;
  await fixture`DELETE FROM app.quiz_reviews WHERE user_id IN (${owner}::uuid, ${other}::uuid)`;
  await fixture`DELETE FROM app.quiz_cards WHERE user_id IN (${owner}::uuid, ${other}::uuid)`;
  await fixture`DELETE FROM app.quiz_questions WHERE user_id IN (${owner}::uuid, ${other}::uuid)`;
  await fixture`DELETE FROM app.canvas_import_jobs WHERE user_id IN (${owner}::uuid, ${other}::uuid)`;
  await fixture`DELETE FROM app.chunks WHERE user_id IN (${owner}::uuid, ${other}::uuid)`;
  await fixture`DELETE FROM app.quiz_sessions WHERE user_id IN (${owner}::uuid, ${other}::uuid)`;
  // the remaining fixture tables cascade from these two disposable accounts
  await fixture`DELETE FROM app.login WHERE user_id IN (${owner}::uuid, ${other}::uuid)`;
});
afterAll(async () => { await Promise.all([fixture.end(), sql.end()]); });

interface MatrixRow {
  name: string;
  run: () => Promise<Response>;
  otherStatus?: number;
  ownerStatus?: number;
}
async function uploadAttachment() {
  const form = new FormData();
  form.set("file", new File(["fixture"], "fixture.txt", { type: "text/plain" }));
  form.set("noteId", noteId);
  return upload(new NextRequest("http://localhost/api/upload", { method: "POST", headers: { origin: "http://localhost" }, body: form }));
}
const rows: MatrixRow[] = [
  { name: "vault import status", run: () => vaultStatus(request("/?type=vault-import")), otherStatus: 200 },
  { name: "vault import cancel", run: () => vaultCancel(request("/", "DELETE"), { params: Promise.resolve({ jobId: importJobId }) }) },
  { name: "quiz start", run: () => startQuiz(request("/", "POST", { filterType: "note", filterValue: [noteId], maxQuestions: 3 })), ownerStatus: 201 },
  { name: "note create", run: () => notes.POST(request("/", "POST", { title: "created", content: "created body" })), otherStatus: 201, ownerStatus: 201 },
  { name: "attachment download", run: () => attachment(request("/?path=fixture.png")) },
  { name: "attachment upload", run: uploadAttachment },
  { name: "settings", run: () => settings(request()), otherStatus: 200 },
  { name: "avatar metadata", run: () => avatar(), otherStatus: 200 },
  { name: "avatar image", run: () => avatarImage(), otherStatus: 200 },
  { name: "study jobs", run: () => studyJobs(request("/", "POST", { kind: "taxonomy" }), context(mapId)), ownerStatus: 202 },
  { name: "vault status", run: () => vaultStatus(request("/?type=vault-export")), otherStatus: 200 },
  { name: "vault cancel", run: () => vaultCancel(request("/", "DELETE"), { params: Promise.resolve({ jobId }) }) },

  { name: "generation cancel", run: () => cancelGeneration(request("/", "POST"), context(generationId)) },
  { name: "generation stream", run: () => streamGeneration(request(), context(generationId)) },
  { name: "chat action approve", run: () => approveAction(request("/", "POST", { decision: "approve" }), context(actionId)), otherStatus: 409 },
  { name: "quiz card", run: () => card(request(), context(cardId)) },
  { name: "quiz answer", run: () => answer(request("/", "POST", { cardId, userAnswer: "answer" }), context(quizId)) },
  { name: "trash restore", run: async () => {
    await moveSubtreeToTrash(owner, noteId);
    return trashAction(request("/", "POST", { action: "restore", id: noteId }));
  } },
  { name: "trash empty", run: async () => {
    await moveSubtreeToTrash(owner, noteId);
    return trashAction(request("/", "POST", { action: "empty" }));
  }, otherStatus: 200 },
  { name: "notes list", run: () => notes.GET(request("/api/notes")), otherStatus: 200 },
  { name: "note read", run: () => note.GET(request(), context(noteId)) },
  { name: "note update", run: () => note.PUT(request("/", "PUT", { content: "changed" }), context(noteId)) },
  { name: "note delete", run: () => note.DELETE(request("/", "DELETE"), context(noteId)) },
  { name: "backlinks", run: () => backlinks(request(), context(noteId)), otherStatus: 200 },
  { name: "path", run: () => path(request(), context(noteId)), otherStatus: 200 },
  { name: "offline copy", run: () => offline(request(), context(noteId)) },
  { name: "note assets", run: () => assets(request("/?name=fixture.png"), context(noteId)) },
  { name: "tree read", run: () => tree(request("/api/tree/children")), otherStatus: 200 },
  { name: "tree move", run: () => move(request("/", "POST", { action: "move", data: { noteId, parentId: folderId, expectedParentId: null } })) },
  { name: "trash list", run: () => trash(request()), otherStatus: 200 },
  { name: "PDF annotations", run: () => annotations(request(`/?noteId=${noteId}`)) },
  { name: "search", run: () => search(request("/?q=private")), otherStatus: 200 },
  { name: "global search", run: () => globalSearch(request("/?q=private")), otherStatus: 200 },
  { name: "chat list", run: () => sessions(request()), otherStatus: 200 },
  { name: "chat session", run: () => chatSession(request(), context(sessionId)) },
  { name: "quiz session", run: () => quizSession(request(), context(quizId)) },
  { name: "study map", run: () => studyMap(request(), context(mapId)) },
  { name: "assignment", run: () => assignment(request(), context(assignmentId)) },
  { name: "time block", run: () => timeBlock(request("/", "PATCH", { completed: true }), context(blockId)) },
  { name: "non-admin analytics", run: () => admin(request()), ownerStatus: 403, otherStatus: 403 },
];

describe.each(rows)("$name", (row) => {
  it.each(["owner", "other", "anonymous"] as const)("%s", async (actor) => {
    if (actor === "anonymous") mocks.auth.mockRejectedValue(new ApiError(401, "Unauthorised"));
    else mocks.auth.mockResolvedValue({ user_id: actor === "owner" ? owner : other, email: "matrix@example.test", session_version: 0 });
    mocks.token = actor === "anonymous" ? "" : generateJWTToken({ user_id: actor === "owner" ? owner : other, session_version: 0 });
    const response = await row.run();
    expect(response.status).toBe(actor === "anonymous" ? 401 : actor === "other" ? row.otherStatus ?? 404 : row.ownerStatus ?? 200);
    const text = await response.text();
    if (actor !== "other") {
      for (const value of [other, otherNoteId, otherFolderId, "other private lecture"]) expect(text).not.toContain(value);
    }
    if (actor !== "owner") {
      for (const value of [owner, noteId, folderId, sessionId, privateText]) expect(text).not.toContain(value);
    }
  });
});
it("drops foreign vector hits at the real hydration boundary", async () => {
  expect(await hydrateOwnedNoteChunks(owner, [{ chunkId }])).toHaveLength(1);
  expect(await hydrateOwnedNoteChunks(other, [{ chunkId }])).toEqual([]);
});
it.each(["owner", "other"] as const)("stores only an owned chat note for %s", async (actor) => {
  const id = await resolveSession(actor === "owner" ? owner : other, undefined, noteId, "new session");
  const [stored] = await fixture`SELECT note_id FROM app.chat_sessions WHERE id = ${id}::uuid`;
  expect(stored.note_id).toBe(actor === "owner" ? noteId : null);
});
it("calendar access requires a valid bearer token even without a session", async () => {
  const valid = await calendar(request(), { params: Promise.resolve({ token }) });
  expect(valid.status).toBe(200);
  expect(await valid.text()).toContain(privateText);
  const unknown = await calendar(request(), { params: Promise.resolve({ token: randomUUID() }) });
  expect(unknown.status).toBe(404);
  expect(await unknown.text()).not.toContain(privateText);
});
// existing contracts: src/__tests__/lib/crypto.test.ts and src/__tests__/api/runpod-marker-webhook.test.ts

it("plain logout preserves other devices while everywhere logout revokes the old session", async () => {
  mocks.auth.mockResolvedValue({ user_id: owner, session_version: 0 });
  mocks.token = generateJWTToken({ user_id: owner, session_version: 0 });
  expect(await validateSession()).toMatchObject({ user_id: owner });
  expect((await logout(request("/", "POST"))).status).toBe(200);
  expect(await validateSession()).toMatchObject({ user_id: owner });
  const response = await logout(request("/", "POST", { everywhere: true }));
  expect(response.status).toBe(200);
  expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith("session=") && /max-age=0/i.test(cookie))).toBe(true);
  expect(await validateSession()).toBeNull();
});
it.each(["owner", "other"] as const)("chat read tools enforce ownership for %s", async (actor) => {
  const userId = actor === "owner" ? owner : other;
  const { tools } = createChatTools(userId, sessionId, null, {}, true);
  const read = tools.readNote?.execute;
  const chunks = tools.getChunks?.execute;
  if (!read || !chunks) throw new Error("missing read tools");
  const options = { toolCallId: "matrix", messages: [] };
  const readResult: unknown = await Reflect.apply(read, undefined, [{ noteId }, options]);
  const body = JSON.stringify(readResult);
  const chunkResult: unknown = await Reflect.apply(chunks, undefined, [{ query: "private", mode: "exact", scope: "all" }, options]);
  const hits = JSON.stringify(chunkResult);
  if (actor === "owner") {
    expect(body).toContain(privateText);
    expect(hits).toContain(privateText);
  } else {
    expect(body).not.toContain(privateText);
    expect(hits).not.toContain(privateText);
    expect(hits).not.toContain(noteId);
  }
});

it("strips injected avatarKey from settings writes", async () => {
  mocks.auth.mockResolvedValue({ user_id: owner, session_version: 0 });
  const response = await saveSettings(request("/", "POST", { avatarKey: "foreign", firstName: "changed" }));
  expect(response.status).toBe(200);
  const stored: unknown = JSON.parse(mocks.objects.get(`settings/${owner}/settings.json`) ?? "{}");
  expect(stored).toMatchObject({ firstName: "changed", avatarKey: `avatars/${owner}/fixture.png` });
});

it("revokes a mobile grant issued before signing out everywhere", async () => {
  mocks.auth.mockResolvedValue({ user_id: owner, session_version: 0 });
  expect((await logout(request("/", "POST", { everywhere: true }))).status).toBe(200);
  mocks.consumeGrant.mockResolvedValue({ userId: owner, sessionVersion: 0, codeChallenge: "fixture" });
  const response = await exchangeMobile(request("/", "POST", { code: "a".repeat(43), codeVerifier: "b".repeat(43) }));
  expect(response.status).toBe(403);
});
it("sets the durable marker even when creation cannot publish to the queue", async () => {
  mocks.auth.mockResolvedValue({ user_id: owner });
  mocks.enqueue.mockRejectedValue(new Error("queue unavailable"));
  const response = await notes.POST(request("/", "POST", { title: "duplicate", content: "body to index" }));
  expect(response.status).toBe(201);
  const [created] = await fixture`SELECT reindex_requested_at FROM app.notes WHERE user_id = ${owner}::uuid AND title = 'duplicate'`;
  expect(created.reindex_requested_at).not.toBeNull();
});
it("makeMDNote succeeds with a durable marker when its enqueue fails", async () => {
  mocks.enqueue.mockRejectedValue(new Error("queue unavailable"));
  const { executeApprovedAction } = createChatTools(owner, sessionId, null, {}, true);
  await expect(executeApprovedAction("makeMDNote", { title: "created action", text: "body from action" })).resolves.toMatchObject({ title: "created action" });
  const [created] = await fixture`SELECT extracted_text, reindex_requested_at FROM app.notes WHERE user_id = ${owner}::uuid AND title = 'created action'`;
  expect(created.extracted_text).toBeNull();
  expect(created.reindex_requested_at).not.toBeNull();
});
it("the worker cannot index a foreign note", async () => {
  expect(await reindexNote(noteId, other)).toBe("missing");
  expect(await reindexNote(noteId, owner)).toBe("indexed");
});
it("rejects paid study jobs at the per-user rate limit", async () => {
  mocks.auth.mockResolvedValue({ user_id: owner });
  mocks.limited.mockResolvedValue(new Response(null, { status: 429 }));
  expect((await studyJobs(request("/", "POST", { kind: "taxonomy" }), context(mapId))).status).toBe(429);
  expect(mocks.limited).toHaveBeenCalledWith("study-map-jobs", owner);
  const [jobs] = await fixture`SELECT count(*)::int AS count FROM app.study_jobs WHERE user_id = ${owner}::uuid`;
  expect(jobs.count).toBe(0);
  expect(RATE_LIMITS["study-map-jobs"].keyType).toBe("userId");
  expect(RATE_LIMITS["quiz-session"].keyType).toBe("userId");
  expect(RATE_LIMITS["quiz-session"].limit).toBeGreaterThanOrEqual(6);
});
it("cannot move an owned note into another user's folder", async () => {
  const ownNote = randomUUID();
  await fixture`INSERT INTO app.notes (note_id, user_id, title) VALUES (${ownNote}::uuid, ${other}::uuid, 'own')`;
  await fixture`INSERT INTO app.tree_items (user_id, note_id) VALUES (${other}::uuid, ${ownNote}::uuid)`;
  mocks.auth.mockResolvedValue({ user_id: other });
  const response = await move(request("/", "POST", { action: "move", data: { noteId: ownNote, parentId: folderId, expectedParentId: null } }));
  expect(response.status).toBe(400);
  const [row] = await fixture`SELECT parent_id FROM app.tree_items WHERE note_id = ${ownNote}::uuid`;
  expect(row.parent_id).toBeNull();
});

it("quiz retries schedule only missing cards once per in-flight user", async () => {
  mocks.auth.mockResolvedValue({ user_id: owner });
  for (let index = 0; index < 10; index++) {
    await fixture`INSERT INTO app.chunks (id, document_id, user_id, text)
      VALUES (${randomUUID()}::uuid, ${noteId}::uuid, ${owner}::uuid, 'uncovered')`;
  }
  const start = () => startQuiz(request("/", "POST", { filterType: "note", filterValue: [noteId], maxQuestions: 3 }));
  expect((await start()).status).toBe(201);
  expect((await start()).status).toBe(201);
  expect(mocks.after).toHaveBeenCalledOnce();
  await mocks.after.mock.calls[0][0]();
  expect(mocks.generate).toHaveBeenCalledWith(owner, expect.any(Array));
  expect(mocks.generate.mock.calls[0][1]).toHaveLength(2);
  expect(mocks.limited).toHaveBeenCalledWith("quiz-session", owner);
});

it("allows the configured analytics administrator through the library guard", async () => {
  vi.stubEnv("ANALYTICS_ADMIN_EMAILS", "matrix-admin@example.test");
  mocks.auth.mockResolvedValue({ user_id: owner, email: "matrix-admin@example.test" });
  await expect(requireAnalyticsAdmin()).resolves.toMatchObject({ user_id: owner });
});
