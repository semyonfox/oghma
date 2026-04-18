/**
 * Black-box tests for POST /api/quiz/sessions/[id]/answer
 *
 * Strategy: mock DB, auth, uuid, and global fetch; call the route handler
 * directly with synthetic NextRequest objects and assert on the HTTP response.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mocks (hoisted) ──────────────────────────────────────────────────────────

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  // tx mock used inside sql.begin() transactions
  const txMock = vi.fn();
  txMock.mockResolvedValue([]);
  sqlMock.begin = vi.fn(async (cb: (tx: any) => Promise<any>) => cb(txMock));
  sqlMock.__txMock = txMock;
  return { default: sqlMock };
});

vi.mock("@/lib/auth", () => ({
  validateSession: vi.fn(),
}));

vi.mock("@/lib/utils/uuid", () => ({
  generateUUID: vi.fn().mockReturnValue("review-uuid-generated"),
  isValidUUID: vi.fn().mockReturnValue(true),
}));

// ── imports ──────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { POST } from "@/app/api/quiz/sessions/[id]/answer/route";
import { validateSession } from "@/lib/auth";
import sql from "@/database/pgsql.js";

// ── fixtures ─────────────────────────────────────────────────────────────────

const MOCK_USER = { user_id: "user-uuid-1", email: "test@example.com" };
const SESSION_ID = "session-uuid-1";
const CARD_ID = "card-uuid-1";
const CORRECT_ANSWER = "O(n log n)";

// session row returned by ownership check
const SESSION_ROW = {
  id: SESSION_ID,
  user_id: "user-uuid-1",
  card_ids: [CARD_ID, "card-uuid-2"],
  total_questions: 20,
};

// quiz_card joined with quiz_questions (route SELECTs correct_answer + question_type)
const CARD_ROW = {
  id: CARD_ID,
  user_id: "user-uuid-1",
  question_id: "question-uuid-1",
  question_type: "mcq",
  correct_answer: CORRECT_ANSWER,
  state: "new",
  stability: 0,
  difficulty: 0,
  elapsed_days: 0,
  scheduled_days: 1,
  reps: 0,
  lapses: 0,
  due: new Date(Date.now() - 1000).toISOString(),
  last_review: null,
};

const NEXT_CARD_ROW = {
  card_id: "card-uuid-2",
  id: "question-uuid-2",
  question_text: "What is the time complexity of binary search?",
  question_type: "mcq",
  bloom_level: 1,
  options: JSON.stringify([
    { text: "O(log n)", is_correct: true },
    { text: "O(n)", is_correct: false },
    { text: "O(n²)", is_correct: false },
    { text: "O(1)", is_correct: false },
  ]),
  correct_answer: "O(log n)",
  explanation: "Binary search halves the search space each step.",
  user_id: "user-uuid-1",
  note_id: "note-uuid-1",
  chunk_id: "chunk-uuid-1",
  state: "new",
  stability: 0,
  difficulty: 0,
  elapsed_days: 0,
  scheduled_days: 1,
  reps: 0,
  lapses: 0,
  due: new Date(Date.now() + 86400000).toISOString(),
  last_review: null,
};

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/quiz/sessions/${SESSION_ID}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Wire up sequential sql return values for a successful answer submission.
 * SQL order (sql = direct queries, tx = inside sql.begin transaction):
 *   1. sql: SELECT quiz_sessions (ownership + card_ids)
 *   2. sql: SELECT COUNT quiz_reviews (answeredSoFar)
 *   3. sql: SELECT card (with correct_answer, question_type)
 *   4. tx:  UPDATE quiz_cards
 *   5. tx:  INSERT quiz_reviews
 *   6. tx:  UPDATE quiz_sessions correct_count
 *   7. sql: SELECT next card (only if includeNextCard)
 *   8. sql: SELECT session stats
 */
function mockSuccessfulAnswer({
  wasCorrect = true,
  includeNextCard = false,
  answeredCount = 3,
}: {
  wasCorrect?: boolean;
  includeNextCard?: boolean;
  answeredCount?: number;
} = {}) {
  const sqlMock = sql as ReturnType<typeof vi.fn> & { __txMock: ReturnType<typeof vi.fn> };
  const txMock = sqlMock.__txMock;
  // 1. SELECT session (ownership + membership)
  sqlMock.mockResolvedValueOnce([SESSION_ROW]);
  // 2. SELECT COUNT reviews (answeredSoFar = answeredCount - 1, since we add 1)
  sqlMock.mockResolvedValueOnce([{ count: answeredCount - 1 }]);
  // 3. SELECT card
  sqlMock.mockResolvedValueOnce([CARD_ROW]);
  // 4-6 run inside sql.begin() via tx
  txMock.mockResolvedValueOnce([]); // UPDATE quiz_cards
  txMock.mockResolvedValueOnce([]); // INSERT quiz_reviews
  txMock.mockResolvedValueOnce([]); // UPDATE quiz_sessions correct_count
  // 7. SELECT next card (only if nextCardId provided)
  if (includeNextCard) {
    sqlMock.mockResolvedValueOnce([NEXT_CARD_ROW]);
  }
  // 8. SELECT session stats
  sqlMock.mockResolvedValueOnce([{
    total_questions: 20,
    correct_count: wasCorrect ? answeredCount : Math.max(0, answeredCount - 1),
  }]);
}

const routeParams = { params: Promise.resolve({ id: SESSION_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  (validateSession as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_USER);
  const sqlMock = sql as ReturnType<typeof vi.fn> & { __txMock: ReturnType<typeof vi.fn>; begin: ReturnType<typeof vi.fn> };
  sqlMock.mockResolvedValue([]);
  sqlMock.__txMock.mockResolvedValue([]);
  sqlMock.begin.mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(sqlMock.__txMock));
  // mock global fetch so streak fire-and-forget doesn't blow up
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

// ── tests ────────────────────────────────────────────────────────────────────

describe("POST /api/quiz/sessions/[id]/answer", () => {
  it("returns 401 when not authenticated", async () => {
    (validateSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = makeRequest({ cardId: CARD_ID });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(401);
  });

  it("returns 400 when cardId is missing", async () => {
    const req = makeRequest({ userAnswer: "something" });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
  });

  it("returns 404 when session does not belong to user", async () => {
    (sql as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]); // session not found
    const req = makeRequest({ cardId: CARD_ID });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(404);
  });

  it("returns 403 when card does not belong to this session", async () => {
    const sqlMock = sql as ReturnType<typeof vi.fn>;
    // session exists but card_ids does not include our cardId
    sqlMock.mockResolvedValueOnce([{ ...SESSION_ROW, card_ids: ["other-card-uuid"] }]);
    const req = makeRequest({ cardId: CARD_ID });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(403);
  });

  it("returns 409 when session is already fully answered", async () => {
    const sqlMock = sql as ReturnType<typeof vi.fn>;
    // session with total_questions: 5
    sqlMock.mockResolvedValueOnce([{ ...SESSION_ROW, total_questions: 5 }]);
    // answeredSoFar = 5 (>= total_questions)
    sqlMock.mockResolvedValueOnce([{ count: 5 }]);
    const req = makeRequest({ cardId: CARD_ID });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(409);
  });

  it("returns 404 when card does not exist for user", async () => {
    const sqlMock = sql as ReturnType<typeof vi.fn>;
    sqlMock.mockResolvedValueOnce([SESSION_ROW]); // session found
    sqlMock.mockResolvedValueOnce([{ count: 0 }]); // no prior answers
    sqlMock.mockResolvedValueOnce([]); // card not found
    const req = makeRequest({ cardId: CARD_ID });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(404);
  });

  it("returns 200 with success:true on correct answer", async () => {
    mockSuccessfulAnswer({ wasCorrect: true });
    // userAnswer matches CARD_ROW.correct_answer → wasCorrect computed as true
    const req = makeRequest({ cardId: CARD_ID, userAnswer: CORRECT_ANSWER });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 200 with success:true on incorrect answer", async () => {
    mockSuccessfulAnswer({ wasCorrect: false, answeredCount: 5 });
    const req = makeRequest({ cardId: CARD_ID, userAnswer: "wrong answer" });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("computes wasCorrect server-side — ignores client-supplied value", async () => {
    mockSuccessfulAnswer({ wasCorrect: false, answeredCount: 3 });
    // client claims wasCorrect: true, but userAnswer does not match correct_answer
    const req = makeRequest({ cardId: CARD_ID, userAnswer: "wrong", wasCorrect: true });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(200);
    // sessionProgress.correct should reflect server-computed value (wasCorrect=false → lower correct count)
    const body = await res.json();
    expect(body.sessionProgress.correct).toBe(2); // Math.max(0, answeredCount - 1) = 2
  });

  it("updates card via DB (multiple SQL calls)", async () => {
    mockSuccessfulAnswer({ wasCorrect: true });
    const req = makeRequest({ cardId: CARD_ID, userAnswer: CORRECT_ANSWER });
    await POST(req, routeParams);
    // sql: session, count, card, stats = 4 direct calls
    // tx (inside sql.begin): UPDATE card, INSERT review, UPDATE session = 3 calls
    const sqlMock = sql as ReturnType<typeof vi.fn> & { __txMock: ReturnType<typeof vi.fn> };
    expect(sqlMock.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(sqlMock.__txMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("returns sessionProgress with answered count", async () => {
    mockSuccessfulAnswer({ wasCorrect: true, answeredCount: 5 });
    const req = makeRequest({ cardId: CARD_ID, userAnswer: CORRECT_ANSWER });
    const res = await POST(req, routeParams);
    const body = await res.json();
    expect(body.sessionProgress).toBeDefined();
    expect(body.sessionProgress.answered).toBe(5);
    expect(body.sessionProgress.total).toBe(20);
  });

  it("returns nextQuestion when nextCardId is provided", async () => {
    mockSuccessfulAnswer({ wasCorrect: true, includeNextCard: true });
    const req = makeRequest({
      cardId: CARD_ID,
      userAnswer: CORRECT_ANSWER,
      nextCardId: "card-uuid-2",
    });
    const res = await POST(req, routeParams);
    const body = await res.json();
    expect(body.nextQuestion).not.toBeNull();
    expect(body.nextQuestion.question_text).toBe(
      "What is the time complexity of binary search?",
    );
    expect(body.nextQuestion.options).toHaveLength(4);
  });

  it("returns nextQuestion:null when no nextCardId is given", async () => {
    mockSuccessfulAnswer({ wasCorrect: true });
    const req = makeRequest({ cardId: CARD_ID, userAnswer: CORRECT_ANSWER });
    const res = await POST(req, routeParams);
    const body = await res.json();
    expect(body.nextQuestion).toBeNull();
  });

  it("fires streak update once the minStreakRound threshold is reached", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    // answeredCount=10 means answeredSoFar=9, answered=10 — crosses the threshold
    mockSuccessfulAnswer({ wasCorrect: true, answeredCount: 10 });
    const req = makeRequest({ cardId: CARD_ID, userAnswer: CORRECT_ANSWER });
    await POST(req, routeParams);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  });

  it("does not fire streak update before the minStreakRound threshold", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    // answeredCount=3 (default) — only 3 answers, well below 10
    mockSuccessfulAnswer({ wasCorrect: true, answeredCount: 3 });
    const req = makeRequest({ cardId: CARD_ID, userAnswer: CORRECT_ANSWER });
    await POST(req, routeParams);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("triggers fatigue warning after 5+ answers with >40% wrong", async () => {
    const sqlMock = sql as ReturnType<typeof vi.fn> & { __txMock: ReturnType<typeof vi.fn> };
    const txMock = sqlMock.__txMock;
    // 1. session
    sqlMock.mockResolvedValueOnce([SESSION_ROW]);
    // 2. answeredSoFar = 5 → answered = 6
    // 6 answered, 3 correct = 3 wrong, 50% > 40% → fatigueWarning
    sqlMock.mockResolvedValueOnce([{ count: 5 }]); // answeredSoFar
    // 3. card
    sqlMock.mockResolvedValueOnce([CARD_ROW]);
    // 4-6. UPDATE card, INSERT review, UPDATE session (inside sql.begin)
    txMock.mockResolvedValueOnce([]);
    txMock.mockResolvedValueOnce([]);
    txMock.mockResolvedValueOnce([]);
    // 7. session stats: 3 correct out of 6 answered = 50% wrong > 40% threshold
    sqlMock.mockResolvedValueOnce([{ total_questions: 20, correct_count: 3 }]);

    const req = makeRequest({ cardId: CARD_ID, userAnswer: "wrong answer" });
    const res = await POST(req, routeParams);
    const body = await res.json();
    expect(body.fatigueWarning).toBe(true);
  });

  it("does not trigger fatigue warning when accuracy is acceptable", async () => {
    // 4 correct out of 4 answered = 0% wrong, under 40% threshold
    // but answered <= 4, so fatigueWarning is also suppressed by the > 4 guard
    mockSuccessfulAnswer({ wasCorrect: true, answeredCount: 4 });
    const req = makeRequest({ cardId: CARD_ID, userAnswer: CORRECT_ANSWER });
    const res = await POST(req, routeParams);
    const body = await res.json();
    expect(body.fatigueWarning).toBe(false);
  });

  it("reports isLeech when card lapses reach the threshold (4)", async () => {
    const lapsedCard = { ...CARD_ROW, lapses: 4 };
    const sqlMock = sql as ReturnType<typeof vi.fn> & { __txMock: ReturnType<typeof vi.fn> };
    const txMock = sqlMock.__txMock;
    // 1. session
    sqlMock.mockResolvedValueOnce([SESSION_ROW]);
    // 2. answeredSoFar
    sqlMock.mockResolvedValueOnce([{ count: 2 }]);
    // 3. lapsed card
    sqlMock.mockResolvedValueOnce([lapsedCard]);
    // 4-6. UPDATE card, INSERT review, UPDATE session (inside sql.begin)
    txMock.mockResolvedValueOnce([]);
    txMock.mockResolvedValueOnce([]);
    txMock.mockResolvedValueOnce([]);
    // 7. session stats
    sqlMock.mockResolvedValueOnce([{ total_questions: 20, correct_count: 2 }]);

    const req = makeRequest({ cardId: CARD_ID, userAnswer: "wrong" });
    const res = await POST(req, routeParams);
    const body = await res.json();
    expect(body.isLeech).toBe(true);
  });
});
