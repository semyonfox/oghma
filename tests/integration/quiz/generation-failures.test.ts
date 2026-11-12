import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { requireE2EDatabaseUrl } from "../helpers/env";

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", async (original) => ({ ...await original<typeof import("ai")>(), generateText: mocks.generateText }));
vi.mock("@/lib/ai-config", async (original) => ({
  ...await original<typeof import("@/lib/ai-config")>(),
  createLlmProvider: () => () => "fixture-model",
}));

import sql from "@/database/pgsql";
import { generateQuestion } from "@/lib/quiz/generate";
import { getSessionCandidates } from "@/lib/quiz/select";

const fixture = postgres(requireE2EDatabaseUrl(), { max: 1 });
let userId: string;
let noteId: string;
let chunkId: string;

function reply(text: string, finishReason = "stop") {
  return { text, finishReason, usage: { inputTokens: 10, outputTokens: 10, outputTokenDetails: { reasoningTokens: 5 } } };
}
async function generate() {
  return generateQuestion({
    userId, noteId, chunkId, chunkText: "Stacks remove the newest item first.",
    moduleName: "Data Structures", bloomLevel: 1, questionType: "fill_in",
  });
}
async function failures(): Promise<number> {
  const [row] = await fixture<{ failures: number }[]>`SELECT quiz_generation_failures AS failures FROM app.chunks WHERE id = ${chunkId}::uuid`;
  return row.failures;
}

beforeEach(async () => {
  mocks.generateText.mockReset();
  userId = randomUUID(); noteId = randomUUID(); chunkId = randomUUID();
  await fixture`INSERT INTO app.login (user_id, email, hashed_password, email_verified, is_active)
    VALUES (${userId}::uuid, ${`quiz-failures-${userId}@example.test`}, 'unused', true, true)`;
  await fixture`INSERT INTO app.notes (note_id, user_id, title, content, is_folder)
    VALUES (${noteId}::uuid, ${userId}::uuid, 'Stacks', 'Stacks remove the newest item first.', false)`;
  await fixture`INSERT INTO app.chunks (id, document_id, user_id, text)
    VALUES (${chunkId}::uuid, ${noteId}::uuid, ${userId}::uuid, 'Stacks remove the newest item first.')`;
});
afterEach(async () => {
  await fixture`DELETE FROM app.chunks WHERE user_id = ${userId}::uuid`;
  await fixture`DELETE FROM app.login WHERE user_id = ${userId}::uuid`;
});
afterAll(async () => { await Promise.all([fixture.end(), sql.end()]); });

describe("quiz generation failure memory", () => {
  it("retires a chunk the model skips, so sessions stop paying for it", async () => {
    mocks.generateText.mockResolvedValue(reply('{"skip": true}'));
    expect((await getSessionCandidates(userId, [chunkId])).uncoveredChunkIds).toEqual([chunkId]);
    await expect(generate()).resolves.toBeNull();
    expect(await failures()).toBe(2);
    expect((await getSessionCandidates(userId, [chunkId])).uncoveredChunkIds).toEqual([]);
  });

  it("gives a garbled reply one more chance before retiring the chunk", async () => {
    mocks.generateText.mockResolvedValue(reply("not json at all"));
    await generate();
    expect(await failures()).toBe(1);
    expect((await getSessionCandidates(userId, [chunkId])).uncoveredChunkIds).toEqual([chunkId]);
    await generate();
    expect(await failures()).toBe(2);
    expect((await getSessionCandidates(userId, [chunkId])).uncoveredChunkIds).toEqual([]);
  });

  it("does not hold a truncated reply or a provider error against the chunk", async () => {
    mocks.generateText.mockResolvedValueOnce(reply('{"question_text": "What', "length"));
    await generate();
    mocks.generateText.mockRejectedValueOnce(new Error("provider down"));
    await generate();
    expect(await failures()).toBe(0);
  });

  it("cannot strike another user's chunk", async () => {
    const otherUserId = randomUUID();
    mocks.generateText.mockResolvedValue(reply('{"skip": true}'));
    await generateQuestion({
      userId: otherUserId, noteId, chunkId, chunkText: "x", moduleName: "x", bloomLevel: 1, questionType: "fill_in",
    });
    expect(await failures()).toBe(0);
  });
});
