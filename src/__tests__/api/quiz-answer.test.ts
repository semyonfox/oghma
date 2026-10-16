/**
 * Tests for POST /api/quiz/sessions/[id]/answer against an in-memory model of
 * the rows it touches. Queries are routed by their SQL, so the assertions are
 * about stored state rather than call order.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { sqlMock, txMock } = vi.hoisted(() => {
  const tx = vi.fn();
  const sql = Object.assign(vi.fn(), { begin: vi.fn() });
  return { sqlMock: sql, txMock: tx };
});

vi.mock("@/database/pgsql", () => ({ default: sqlMock }));
vi.mock("@/lib/auth/session", () => ({ validateSession: vi.fn() }));
vi.mock("@/lib/quiz/streak", () => ({ advanceQuizStreak: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/quiz/sessions/[id]/answer/route";
import { validateSession } from "@/lib/auth/session";
import { advanceQuizStreak } from "@/lib/quiz/streak";

const USER = { user_id: "00000000-0000-4000-8000-000000000001", email: "test@example.com" };
const SESSION_ID = "00000000-0000-4000-8000-0000000000a1";
const CARD_ID = "00000000-0000-4000-8000-0000000000c1";
const NEXT_CARD_ID = "00000000-0000-4000-8000-0000000000c2";

interface Review {
  card_id: string;
  was_correct: boolean;
}

interface CardRow {
  id: string;
  question_id: string;
  question_type: string;
  options: unknown;
  correct_answer: string;
  state: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  due: string;
  last_review: string | null;
}

const MCQ_OPTIONS = [
  { text: "O(n log n)", is_correct: true },
  { text: "O(n)", is_correct: false },
  { text: "O(n²)", is_correct: false },
  { text: "O(1)", is_correct: false },
];

function cardRow(overrides: Partial<CardRow> = {}): CardRow {
  return {
    id: CARD_ID,
    question_id: "00000000-0000-4000-8000-0000000000b1",
    question_type: "mcq",
    options: MCQ_OPTIONS,
    correct_answer: "O(n log n)",
    state: "new",
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    due: new Date(Date.now() - 1000).toISOString(),
    last_review: null,
    ...overrides,
  };
}

let db: {
  session: { card_ids: string[]; total_questions: number; correct_count: number } | null;
  reviews: Review[];
  card: CardRow | null;
  cardUpdates: number;
  completedAt: boolean;
};

function query(strings: TemplateStringsArray): string {
  return strings.join("?");
}

function txQuery(strings: TemplateStringsArray, ...values: unknown[]): unknown[] {
  const text = query(strings);
  if (text.includes("FROM app.quiz_sessions")) return db.session ? [db.session] : [];
  if (text.includes("FROM app.quiz_reviews")) return [...db.reviews];
  if (text.includes("FROM app.quiz_cards qc")) return db.card ? [db.card] : [];
  if (text.includes("UPDATE app.quiz_cards")) {
    db.cardUpdates += 1;
    return [];
  }
  if (text.includes("INSERT INTO app.quiz_reviews")) {
    // values: id, user, card, question, rating, answer, was_correct, ...
    db.reviews.push({ card_id: values[2] as string, was_correct: values[6] as boolean });
    return [];
  }
  if (text.includes("UPDATE app.quiz_sessions") && db.session) {
    if (values[0] === 1) db.session.correct_count += 1;
    if ((values[1] as number) >= db.session.total_questions) db.completedAt = true;
    return [{ total_questions: db.session.total_questions, correct_count: db.session.correct_count }];
  }
  throw new Error(`unexpected tx query: ${text}`);
}

function outerQuery(strings: TemplateStringsArray): unknown[] {
  const text = query(strings);
  if (text.includes("SELECT id FROM app.quiz_cards")) return [{ id: NEXT_CARD_ID }];
  if (text.includes("JOIN app.quiz_questions")) {
    return [{
      card_id: NEXT_CARD_ID,
      id: "00000000-0000-4000-8000-0000000000b2",
      question_type: "mcq",
      bloom_level: 1,
      question_text: "What is the time complexity of binary search?",
      options: JSON.stringify(MCQ_OPTIONS),
      correct_answer: "O(log n)",
      explanation: "Binary search halves the search space each step.",
    }];
  }
  throw new Error(`unexpected query: ${text}`);
}

function seed({
  answered = 0,
  correct = answered,
  total = 20,
  card = cardRow(),
}: { answered?: number; correct?: number; total?: number; card?: CardRow | null } = {}) {
  const reviews = Array.from({ length: answered }, (_, i) => ({
    card_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    was_correct: i < correct,
  }));
  db = {
    session: {
      card_ids: [...reviews.map(({ card_id }) => card_id), CARD_ID, NEXT_CARD_ID],
      total_questions: total,
      correct_count: correct,
    },
    reviews,
    card,
    cardUpdates: 0,
    completedAt: false,
  };
}

function answer(body: Record<string, unknown>) {
  return POST(
    new NextRequest(`http://localhost/api/quiz/sessions/${SESSION_ID}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: SESSION_ID }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  seed();
  vi.mocked(validateSession).mockResolvedValue(USER as never);
  txMock.mockImplementation(txQuery);
  sqlMock.mockImplementation(outerQuery);
  // serialise transactions like the session row lock does
  let tail = Promise.resolve();
  sqlMock.begin.mockImplementation((work: (tx: typeof txMock) => Promise<unknown>) => {
    const run = tail.then(() => work(txMock));
    tail = run.then(() => undefined, () => undefined);
    return run;
  });
  vi.mocked(advanceQuizStreak).mockResolvedValue({
    advanced: true,
    current_streak: 4,
    newMilestone: null,
  });
});

describe("POST /api/quiz/sessions/[id]/answer", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(validateSession).mockResolvedValue(null);
    expect((await answer({ cardId: CARD_ID })).status).toBe(401);
  });

  it("rejects a missing or malformed cardId", async () => {
    expect((await answer({ userAnswer: "x" })).status).toBe(400);
    expect((await answer({ cardId: "card-1" })).status).toBe(400);
    expect(sqlMock.begin).not.toHaveBeenCalled();
  });

  it("returns 404 when the session does not belong to the user", async () => {
    db.session = null;
    expect((await answer({ cardId: CARD_ID })).status).toBe(404);
  });

  it("returns 403 when the card is not part of the session", async () => {
    db.session!.card_ids = [NEXT_CARD_ID];
    expect((await answer({ cardId: CARD_ID })).status).toBe(403);
    expect(db.cardUpdates).toBe(0);
  });

  it("returns 409 when every card in the session has been answered", async () => {
    seed({ answered: 5, total: 5 });
    expect((await answer({ cardId: CARD_ID })).status).toBe(409);
  });

  it("returns 404 when the card no longer exists", async () => {
    seed({ card: null });
    expect((await answer({ cardId: CARD_ID })).status).toBe(404);
  });

  it("grades on the server and ignores a client-supplied wasCorrect", async () => {
    const res = await answer({ cardId: CARD_ID, userAnswer: "O(n)", wasCorrect: true });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ wasCorrect: false, duplicate: false });
    expect(db.reviews.at(-1)).toEqual({ card_id: CARD_ID, was_correct: false });
  });

  it("grades a choice by the chosen option even if correct_answer disagrees", async () => {
    seed({ card: cardRow({ correct_answer: "stale text" }) });
    const body = await (await answer({ cardId: CARD_ID, userAnswer: "O(n log n)" })).json();
    expect(body.wasCorrect).toBe(true);
  });

  it("persists the FSRS learning step with the rest of the card", async () => {
    await answer({ cardId: CARD_ID, userAnswer: "O(n log n)", responseTimeMs: 8000 });
    const update = txMock.mock.calls.find(([strings]) =>
      query(strings as TemplateStringsArray).includes("UPDATE app.quiz_cards"),
    );
    expect(query(update![0] as TemplateStringsArray)).toContain("learning_steps = ?");
    // a "good" first review lands on step 1
    expect(update!.slice(1)).toContain(1);
  });

  it("replays a duplicate submit without rescheduling the card", async () => {
    const first = await (await answer({ cardId: CARD_ID, userAnswer: "O(n log n)" })).json();
    const second = await (await answer({ cardId: CARD_ID, userAnswer: "O(n)" })).json();

    expect(db.cardUpdates).toBe(1);
    expect(db.reviews.filter(({ card_id }) => card_id === CARD_ID)).toHaveLength(1);
    expect(second).toMatchObject({
      duplicate: true,
      wasCorrect: first.wasCorrect,
      sessionProgress: first.sessionProgress,
    });
    expect(second.nextQuestion.card_id).toBe(NEXT_CARD_ID);
  });

  it("records only one review for concurrent submissions of the same card", async () => {
    const responses = await Promise.all([
      answer({ cardId: CARD_ID, userAnswer: "O(n log n)" }),
      answer({ cardId: CARD_ID, userAnswer: "O(n log n)" }),
    ]);
    const bodies = await Promise.all(responses.map((r) => r.json()));

    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(bodies.map((b) => b.duplicate).sort()).toEqual([false, true]);
    expect(db.cardUpdates).toBe(1);
    const lock = txMock.mock.calls.find(([strings]) =>
      query(strings as TemplateStringsArray).includes("FROM app.quiz_sessions"),
    );
    expect(query(lock![0] as TemplateStringsArray)).toContain("FOR UPDATE");
  });

  it("returns the next card in the session, chosen on the server", async () => {
    const body = await (await answer({ cardId: CARD_ID, userAnswer: "x" })).json();
    expect(body.nextQuestion).toMatchObject({
      card_id: NEXT_CARD_ID,
      question_text: "What is the time complexity of binary search?",
    });
    expect(body.nextQuestion.options).toHaveLength(4);
    expect(body.nextQuestion).not.toHaveProperty("user_id");
  });

  it("marks the session complete when the last card is answered", async () => {
    seed({ answered: 4, total: 5 });
    const body = await (await answer({ cardId: CARD_ID, userAnswer: "O(n log n)" })).json();
    expect(body.sessionProgress).toEqual({ answered: 5, total: 5, correct: 5 });
    expect(db.completedAt).toBe(true);
  });

  it("advances the streak once a full round of 10 is answered", async () => {
    seed({ answered: 9 });
    const body = await (await answer({ cardId: CARD_ID, userAnswer: "x", timeZone: "Europe/Dublin" })).json();
    expect(body.streakResult).toMatchObject({ advanced: true });
    expect(advanceQuizStreak).toHaveBeenCalledWith(USER.user_id, expect.any(Date), "Europe/Dublin");
  });

  it("counts a short session toward the streak once it is finished", async () => {
    // regression: sessions with fewer than 10 cards could never advance it
    seed({ answered: 2, total: 3 });
    await answer({ cardId: CARD_ID, userAnswer: "x" });
    expect(advanceQuizStreak).toHaveBeenCalledOnce();
  });

  it("does not advance the streak before the round is complete", async () => {
    seed({ answered: 3 });
    const body = await (await answer({ cardId: CARD_ID, userAnswer: "x" })).json();
    expect(body.streakResult).toBeNull();
    expect(advanceQuizStreak).not.toHaveBeenCalled();
  });

  it("does not advance the streak on a replayed answer", async () => {
    seed({ answered: 9 });
    await answer({ cardId: CARD_ID, userAnswer: "x" });
    vi.mocked(advanceQuizStreak).mockClear();
    await answer({ cardId: CARD_ID, userAnswer: "x" });
    expect(advanceQuizStreak).not.toHaveBeenCalled();
  });

  it("keeps the answer when the streak update fails", async () => {
    seed({ answered: 9 });
    vi.mocked(advanceQuizStreak).mockRejectedValue(new Error("db down"));
    const res = await answer({ cardId: CARD_ID, userAnswer: "x" });
    expect(res.status).toBe(200);
    expect((await res.json()).streakResult).toBeNull();
  });

  it("warns about fatigue after 5+ answers with over 40% wrong", async () => {
    seed({ answered: 5, correct: 3 });
    const body = await (await answer({ cardId: CARD_ID, userAnswer: "wrong" })).json();
    expect(body.fatigueWarning).toBe(true);
  });

  it("flags a leech when lapses reach the threshold", async () => {
    seed({
      card: cardRow({
        state: "review",
        lapses: 3,
        stability: 5,
        difficulty: 6,
        reps: 6,
        last_review: new Date(Date.now() - 86_400_000 * 5).toISOString(),
      }),
    });
    const res = await answer({ cardId: CARD_ID, userAnswer: "wrong" });
    const body = await res.json();
    expect(body.isLeech).toBe(true);
  });
});
