/**
 * Black-box tests for POST /api/quiz/sessions/[id]/answer
 *
 * Strategy: mock DB, auth, uuid, and global fetch; call the route handler
 * directly with synthetic NextRequest objects and assert on the HTTP response.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mocks (hoisted) ──────────────────────────────────────────────────────────

vi.mock("@/database/pgsql", () => {
  const sqlMock = vi.fn() as ReturnType<typeof vi.fn> & {
    begin: ReturnType<typeof vi.fn>;
    __txMock: ReturnType<typeof vi.fn>;
  };
  sqlMock.mockResolvedValue([]);
  // tx mock used inside sql.begin() transactions
  const txMock = vi.fn();
  txMock.mockResolvedValue([]);
  sqlMock.begin = vi.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock));
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

vi.mock("@/lib/quiz/streak", () => ({
  advanceQuizStreak: vi.fn(),
}));

// ── imports ──────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { POST } from "@/app/api/quiz/sessions/[id]/answer/route";
import { validateSession } from "@/lib/auth";
import { advanceQuizStreak } from "@/lib/quiz/streak";
import sql from "@/database/pgsql";

type MockSql = ReturnType<typeof vi.fn> & {
  begin: ReturnType<typeof vi.fn>;
  __txMock: ReturnType<typeof vi.fn>;
};

const sqlMock = sql as unknown as MockSql;

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
 * Transaction order:
 *   1. SELECT and lock quiz_session
 *   2. SELECT existing review for this card
 *   3. SELECT review count
 *   4. SELECT and lock card + question
 *   5. UPDATE quiz_card
 *   6. INSERT quiz_review
 *   7. UPDATE quiz_session and return progress
 * A direct query fetches the next card only when requested.
 */
function mockSuccessfulAnswer({
  wasCorrect = true,
  includeNextCard = false,
  answeredCount = 3,
  correctCount,
  cardRow = CARD_ROW,
}: {
  wasCorrect?: boolean;
  includeNextCard?: boolean;
  answeredCount?: number;
  correctCount?: number;
  cardRow?: typeof CARD_ROW;
} = {}) {
  const txMock = sqlMock.__txMock;
  txMock.mockResolvedValueOnce([SESSION_ROW]);
  txMock.mockResolvedValueOnce([]); // no existing review
  txMock.mockResolvedValueOnce([{ count: answeredCount - 1 }]);
  txMock.mockResolvedValueOnce([cardRow]);
  txMock.mockResolvedValueOnce([]); // UPDATE quiz_cards
  txMock.mockResolvedValueOnce([]); // INSERT quiz_reviews
  txMock.mockResolvedValueOnce([{
    total_questions: 20,
    correct_count:
      correctCount ??
      (wasCorrect ? answeredCount : Math.max(0, answeredCount - 1)),
  }]);
  if (includeNextCard) {
    sqlMock.mockResolvedValueOnce([NEXT_CARD_ROW]);
  }
}

const routeParams = { params: Promise.resolve({ id: SESSION_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  (validateSession as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_USER);
  sqlMock.mockResolvedValue([]);
  sqlMock.__txMock.mockResolvedValue([]);
  sqlMock.begin.mockImplementation(async (cb: (tx: typeof sqlMock.__txMock) => Promise<unknown>) => cb(sqlMock.__txMock));
  (advanceQuizStreak as ReturnType<typeof vi.fn>).mockResolvedValue({
    advanced: true,
    current_streak: 4,
    newMilestone: null,
  });
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
    sqlMock.__txMock.mockResolvedValueOnce([]); // session not found
    const req = makeRequest({ cardId: CARD_ID });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(404);
  });

  it("returns 403 when card does not belong to this session", async () => {
    // session exists but card_ids does not include our cardId
    sqlMock.__txMock.mockResolvedValueOnce([
      { ...SESSION_ROW, card_ids: ["other-card-uuid"] },
    ]);
    const req = makeRequest({ cardId: CARD_ID });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(403);
  });

  it("returns 409 when session is already fully answered", async () => {
    // session with total_questions: 5
    sqlMock.__txMock.mockResolvedValueOnce([
      { ...SESSION_ROW, total_questions: 5 },
    ]);
    sqlMock.__txMock.mockResolvedValueOnce([]); // no duplicate review
    // answeredSoFar = 5 (>= total_questions)
    sqlMock.__txMock.mockResolvedValueOnce([{ count: 5 }]);
    const req = makeRequest({ cardId: CARD_ID });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(409);
  });

  it("returns 404 when card does not exist for user", async () => {
    sqlMock.__txMock.mockResolvedValueOnce([SESSION_ROW]);
    sqlMock.__txMock.mockResolvedValueOnce([]); // no existing review
    sqlMock.__txMock.mockResolvedValueOnce([{ count: 0 }]);
    sqlMock.__txMock.mockResolvedValueOnce([]); // card not found
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

  it("does not apply fill-in fuzzy normalization to MCQ answers", async () => {
    mockSuccessfulAnswer({
      wasCorrect: false,
      answeredCount: 3,
      cardRow: { ...CARD_ROW, question_type: "mcq", correct_answer: "C++" },
    });

    const req = makeRequest({ cardId: CARD_ID, userAnswer: "C" });
    const res = await POST(req, routeParams);

    expect(res.status).toBe(200);
    const insertReviewCall = sqlMock.__txMock.mock.calls.find(([strings]) =>
      (strings as TemplateStringsArray).join("").includes("INSERT INTO app.quiz_reviews"),
    );
    expect(insertReviewCall).toBeDefined();
    expect(insertReviewCall).toEqual(
      expect.arrayContaining([1, "C", false]),
    );
  });

  it("updates card via DB (multiple SQL calls)", async () => {
    mockSuccessfulAnswer({ wasCorrect: true });
    const req = makeRequest({ cardId: CARD_ID, userAnswer: CORRECT_ANSWER });
    await POST(req, routeParams);
    expect(sqlMock.__txMock.mock.calls.length).toBeGreaterThanOrEqual(7);
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
    // answeredCount=10 means answeredSoFar=9, answered=10 — crosses the threshold
    mockSuccessfulAnswer({ wasCorrect: true, answeredCount: 10 });
    const req = makeRequest({ cardId: CARD_ID, userAnswer: CORRECT_ANSWER });
    const res = await POST(req, routeParams);
    const body = await res.json();
    // streak logic ran inline and returned result
    expect(body.streakResult).not.toBeNull();
    expect(body.streakResult.advanced).toBe(true);
    expect(advanceQuizStreak).toHaveBeenCalledOnce();
  });

  it("does not fire streak update before the minStreakRound threshold", async () => {
    // answeredCount=3 (default) — only 3 answers, well below 10
    mockSuccessfulAnswer({ wasCorrect: true, answeredCount: 3 });
    const req = makeRequest({ cardId: CARD_ID, userAnswer: CORRECT_ANSWER });
    const res = await POST(req, routeParams);
    const body = await res.json();
    expect(body.streakResult).toBeNull();
    expect(advanceQuizStreak).not.toHaveBeenCalled();
  });

  it("keeps streakResult null when today's streak was already counted", async () => {
    mockSuccessfulAnswer({ wasCorrect: true, answeredCount: 10 });
    (advanceQuizStreak as ReturnType<typeof vi.fn>).mockResolvedValue({
      advanced: false,
      current_streak: 4,
      newMilestone: null,
    });

    const response = await POST(
      makeRequest({ cardId: CARD_ID, userAnswer: CORRECT_ANSWER }),
      routeParams,
    );

    expect((await response.json()).streakResult).toBeNull();
  });

  it("rejects a duplicate card without changing review or streak state", async () => {
    sqlMock.__txMock.mockResolvedValueOnce([SESSION_ROW]);
    sqlMock.__txMock.mockResolvedValueOnce([{ id: "existing-review" }]);

    const res = await POST(
      makeRequest({ cardId: CARD_ID, userAnswer: CORRECT_ANSWER }),
      routeParams,
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "Card already answered" });
    expect(sqlMock.__txMock).toHaveBeenCalledTimes(2);
    expect(advanceQuizStreak).not.toHaveBeenCalled();
  });

  it("serializes parallel submissions so only one review is recorded", async () => {
    let answered = false;
    let inserts = 0;
    let transactionTail = Promise.resolve();

    sqlMock.__txMock.mockImplementation(
      async (strings: TemplateStringsArray) => {
        const query = strings.join(" ");
        if (query.includes("FROM app.quiz_sessions")) return [SESSION_ROW];
        if (query.includes("SELECT id") && query.includes("app.quiz_reviews")) {
          return answered ? [{ id: "first-review" }] : [];
        }
        if (query.includes("COUNT(*)")) return [{ count: 0 }];
        if (query.includes("FROM app.quiz_cards")) return [CARD_ROW];
        if (query.includes("INSERT INTO app.quiz_reviews")) {
          answered = true;
          inserts += 1;
          return [];
        }
        if (query.includes("RETURNING total_questions")) {
          return [{ total_questions: 20, correct_count: 1 }];
        }
        return [];
      },
    );
    sqlMock.begin.mockImplementation((callback: (tx: MockSql) => Promise<unknown>) => {
      const transaction = transactionTail.then(() => callback(sqlMock.__txMock as MockSql));
      transactionTail = transaction.then(() => undefined, () => undefined);
      return transaction;
    });

    const responses = await Promise.all([
      POST(makeRequest({ cardId: CARD_ID, userAnswer: CORRECT_ANSWER }), routeParams),
      POST(makeRequest({ cardId: CARD_ID, userAnswer: CORRECT_ANSWER }), routeParams),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(inserts).toBe(1);
    expect(advanceQuizStreak).not.toHaveBeenCalled();
    const sessionLock = sqlMock.__txMock.mock.calls.find(([strings]) =>
      (strings as TemplateStringsArray).join(" ").includes("FROM app.quiz_sessions"),
    );
    expect((sessionLock?.[0] as TemplateStringsArray).join(" ")).toContain(
      "FOR UPDATE",
    );
  });

  it("triggers fatigue warning after 5+ answers with >40% wrong", async () => {
    mockSuccessfulAnswer({
      wasCorrect: false,
      answeredCount: 6,
      correctCount: 3,
    });

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
    mockSuccessfulAnswer({
      wasCorrect: false,
      answeredCount: 3,
      correctCount: 2,
      cardRow: lapsedCard,
    });

    const req = makeRequest({ cardId: CARD_ID, userAnswer: "wrong" });
    const res = await POST(req, routeParams);
    const body = await res.json();
    expect(body.isLeech).toBe(true);
  });
});
