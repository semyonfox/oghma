import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), sql: vi.fn(), after: vi.fn(), generate: vi.fn(), limited: vi.fn(),
  candidates: vi.fn(), cards: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ validateSession: mocks.auth }));
vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: mocks.after }));
vi.mock("@/lib/rate-limiter", () => ({ checkRateLimit: mocks.limited }));
vi.mock("@/lib/quiz/select", () => ({
  resolveNoteIds: async () => ["note"],
  resolveChunkIds: async () => ["chunk"], getSessionCandidates: mocks.candidates,
  selectCards: mocks.cards, sessionCardIds: (ids: string[]) => ids,
}));
vi.mock("@/lib/quiz/generate-background", () => ({ generateBatch: mocks.generate }));
import { POST } from "@/app/api/quiz/sessions/route";
const start = (maxQuestions = 10) => POST(new NextRequest("http://localhost/api/quiz/sessions", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ filterType: "all", maxQuestions }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user_id: crypto.randomUUID() });
  mocks.limited.mockResolvedValue(null);
  mocks.cards.mockReturnValue([]);
  mocks.candidates.mockResolvedValue({ uncoveredChunkIds: Array.from({ length: 30 }, (_, i) => `chunk-${i}`) });
  mocks.sql.mockImplementation(async (parts: TemplateStringsArray) => parts.join("").includes("ORDER BY random()")
    ? Array.from({ length: 30 }, (_, i) => ({ id: `chunk-${i}`, module_id: String(i) })) : []);
  mocks.generate.mockResolvedValue(0);
});
afterEach(async () => {
  for (const [callback] of mocks.after.mock.calls) await callback();
});
it("schedules only missing cards and ignores retries while its batch is pending", async () => {
  mocks.cards.mockReturnValue(["one", "two", "three"]);
  // the final response loads a question, which is irrelevant to the scheduled batch
  await start();
  await start();
  expect(mocks.after).toHaveBeenCalledOnce();
  const [callback] = mocks.after.mock.calls[0];
  await callback();
  expect(mocks.generate).toHaveBeenCalledWith(expect.any(String), Array.from({ length: 7 }, (_, i) => `chunk-${i}`));
  expect(mocks.limited).toHaveBeenCalledWith("quiz-session", expect.any(String));
});
it("still tops up a small batch when the session is already full", async () => {
  mocks.cards.mockReturnValue(Array.from({ length: 10 }, (_, i) => `card-${i}`));
  await start();
  expect(mocks.after).toHaveBeenCalledOnce();
  await mocks.after.mock.calls[0][0]();
  expect(mocks.generate.mock.calls[0][1]).toHaveLength(5);
});

it("does not let one filter's pending batch block another filter", async () => {
  const startFilter = (filterType: string, filterValue?: string[]) => POST(new NextRequest("http://localhost/api/quiz/sessions", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ filterType, ...(filterValue ? { filterValue } : {}), maxQuestions: 10 }),
  }));
  await startFilter("all");
  await startFilter("note", [crypto.randomUUID()]);
  expect(mocks.after).toHaveBeenCalledTimes(2);
});
it("stops before generation when the per-user rate limit rejects a start", async () => {
  mocks.limited.mockResolvedValue(new Response(null, { status: 429 }));
  expect((await start()).status).toBe(429);
  expect(mocks.sql).not.toHaveBeenCalled();
  expect(mocks.after).not.toHaveBeenCalled();
});

it("caps an empty session's generation pass at 25 chunks", async () => {
  expect((await start(50)).status).toBe(202);
  await mocks.after.mock.calls[0][0]();
  expect(mocks.generate.mock.calls[0][1]).toHaveLength(25);
});
