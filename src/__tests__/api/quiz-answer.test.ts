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

// a minimal quiz_card row joined with quiz_questions (what the route SELECTs)
const CARD_ROW = {
  id: "card-uuid-1",
  user_id: "user-uuid-1",
  question_id: "question-uuid-1",
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

// wire up sequential sql return values for a successful answer submission
function mockSuccessfulAnswer({
  wasCorrect = true,
  includeNextCard = false,
  answeredCount = 3,
}: {
  wasCorrect?: boolean;
  includeNextCard?: boolean;
  answeredCount?: number;
} = {}) {
  const sqlMock = sql as ReturnType<typeof vi.fn>;
  // 1. SELECT card
  sqlMock.mockResolvedValueOnce([CARD_ROW]);
  // 2. UPDATE quiz_cards
  sqlMock.mockResolvedValueOnce([]);
  // 3. INSERT quiz_reviews
  sqlMock.mockResolvedValueOnce([]);
  // 4. UPDATE quiz_sessions correct_count
  sqlMock.mockResolvedValueOnce([]);
  // 5. SELECT next card (only if nextCardId provided)
  if (includeNextCard) {
    sqlMock.mockResolvedValueOnce([NEXT_CARD_ROW]);
  }
  // 6. SELECT session stats
  sqlMock.mockResolvedValueOnce([{
    total_questions: 20,
    correct_count: wasCorrect ? answeredCount : Math.max(0, answeredCount - 1),
  }]);
  // 7. SELECT COUNT reviews
  sqlMock.mockResolvedValueOnce([{ count: answeredCount }]);
}

const routeParams = { params: Promise.resolve({ id: SESSION_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  (validateSession as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_USER);
  (sql as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  // mock global fetch so streak fire-and-forget doesn't blow up
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

// ── tests ────────────────────────────────────────────────────────────────────

describe("POST /api/quiz/sessions/[id]/answer", () => {
  it("returns 401 when not authenticated", async () => {
    (validateSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = makeRequest({ cardId: "card-uuid-1", wasCorrect: true });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(401);
  });

  it("returns 400 when cardId is missing", async () => {
    const req = makeRequest({ wasCorrect: true });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
  });

  it("returns 400 when wasCorrect is missing", async () => {
    const req = makeRequest({ cardId: "card-uuid-1" });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
  });

  it("returns 404 when card does not exist for user", async () => {
    (sql as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]); // no card found
    const req = makeRequest({ cardId: "nonexistent", wasCorrect: true });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(404);
  });

  it("returns 200 with success:true on correct answer", async () => {
    mockSuccessfulAnswer({ wasCorrect: true });
    const req = makeRequest({ cardId: "card-uuid-1", wasCorrect: true });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 200 with success:true on incorrect answer", async () => {
    mockSuccessfulAnswer({ wasCorrect: false, answeredCount: 5 });
    const req = makeRequest({ cardId: "card-uuid-1", wasCorrect: false });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("updates card via DB (UPDATE is called)", async () => {
    mockSuccessfulAnswer({ wasCorrect: true });
    const req = makeRequest({ cardId: "card-uuid-1", wasCorrect: true });
    await POST(req, routeParams);
    // sql is called at least 4 times: SELECT card, UPDATE card, INSERT review, UPDATE session
    expect((sql as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("returns sessionProgress with answered count", async () => {
    mockSuccessfulAnswer({ wasCorrect: true, answeredCount: 5 });
    const req = makeRequest({ cardId: "card-uuid-1", wasCorrect: true });
    const res = await POST(req, routeParams);
    const body = await res.json();
    expect(body.sessionProgress).toBeDefined();
    expect(body.sessionProgress.answered).toBe(5);
    expect(body.sessionProgress.total).toBe(20);
  });

  it("returns nextQuestion when nextCardId is provided", async () => {
    mockSuccessfulAnswer({ wasCorrect: true, includeNextCard: true });
    const req = makeRequest({
      cardId: "card-uuid-1",
      wasCorrect: true,
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
    const req = makeRequest({ cardId: "card-uuid-1", wasCorrect: true });
    const res = await POST(req, routeParams);
    const body = await res.json();
    expect(body.nextQuestion).toBeNull();
  });

  it("fires streak update as fire-and-forget (fetch called)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    mockSuccessfulAnswer({ wasCorrect: true });
    const req = makeRequest({ cardId: "card-uuid-1", wasCorrect: true });
    await POST(req, routeParams);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  });

  it("triggers fatigue warning after 5+ answers with >40% wrong", async () => {
    const sqlMock = sql as ReturnType<typeof vi.fn>;
    // card SELECT
    sqlMock.mockResolvedValueOnce([CARD_ROW]);
    // UPDATE card, INSERT review, UPDATE session
    sqlMock.mockResolvedValueOnce([]);
    sqlMock.mockResolvedValueOnce([]);
    sqlMock.mockResolvedValueOnce([]);
    // session stats: 3 correct out of 6 answered = 50% wrong > 40% threshold
    sqlMock.mockResolvedValueOnce([{ total_questions: 20, correct_count: 3 }]);
    // review count
    sqlMock.mockResolvedValueOnce([{ count: 6 }]);

    const req = makeRequest({ cardId: "card-uuid-1", wasCorrect: false });
    const res = await POST(req, routeParams);
    const body = await res.json();
    expect(body.fatigueWarning).toBe(true);
  });

  it("does not trigger fatigue warning when accuracy is acceptable", async () => {
    // 4 answered, 3 correct = 25% wrong, under 40% threshold
    mockSuccessfulAnswer({ wasCorrect: true, answeredCount: 4 });
    const req = makeRequest({ cardId: "card-uuid-1", wasCorrect: true });
    const res = await POST(req, routeParams);
    const body = await res.json();
    expect(body.fatigueWarning).toBe(false);
  });

  it("reports isLeech when card lapses reach the threshold (4)", async () => {
    const lapsedCard = { ...CARD_ROW, lapses: 4 };
    const sqlMock = sql as ReturnType<typeof vi.fn>;
    sqlMock.mockResolvedValueOnce([lapsedCard]);
    sqlMock.mockResolvedValueOnce([]);
    sqlMock.mockResolvedValueOnce([]);
    sqlMock.mockResolvedValueOnce([]);
    sqlMock.mockResolvedValueOnce([{ total_questions: 20, correct_count: 2 }]);
    sqlMock.mockResolvedValueOnce([{ count: 3 }]);

    const req = makeRequest({ cardId: "card-uuid-1", wasCorrect: false });
    const res = await POST(req, routeParams);
    const body = await res.json();
    expect(body.isLeech).toBe(true);
  });
});
