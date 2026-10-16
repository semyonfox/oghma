import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ validateSession: vi.fn() }));

import { NextRequest } from "next/server";
import sql from "@/database/pgsql";
import { validateSession } from "@/lib/auth/session";
import { GET as getSession } from "@/app/api/quiz/sessions/[id]/route";
import { GET as getReviewDates } from "@/app/api/quiz/review-dates/route";

const USER = { user_id: "00000000-0000-4000-8000-000000000001", email: "s@example.com" };
const SESSION_ID = "00000000-0000-4000-8000-0000000000a1";
const CARDS = [
  "00000000-0000-4000-8000-0000000000c1",
  "00000000-0000-4000-8000-0000000000c2",
  "00000000-0000-4000-8000-0000000000c3",
];

function query(strings: TemplateStringsArray): string {
  return strings.join("?");
}

function questionRow(cardId: string) {
  return {
    card_id: cardId,
    id: `${cardId.slice(0, -2)}b0`,
    question_type: "fill_in",
    bloom_level: 1,
    question_text: `Question for ${cardId}`,
    options: null,
    correct_answer: "answer",
    explanation: "",
  };
}

function resume() {
  return getSession(new NextRequest(`http://localhost/api/quiz/sessions/${SESSION_ID}`), {
    params: Promise.resolve({ id: SESSION_ID }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validateSession).mockResolvedValue(USER as never);
});

describe("GET /api/quiz/sessions/[id]", () => {
  function sessionState({
    answered,
    existing = CARDS,
    completed = false,
  }: { answered: string[]; existing?: string[]; completed?: boolean }) {
    vi.mocked(sql).mockImplementation((async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = query(strings);
      if (text.includes("FROM app.quiz_sessions")) {
        return [{ card_ids: CARDS, correct_count: 1, completed_at: completed ? new Date() : null }];
      }
      if (text.includes("FROM app.quiz_reviews")) return answered.map((card_id) => ({ card_id }));
      if (text.includes("SELECT id FROM app.quiz_cards")) return existing.map((id) => ({ id }));
      if (text.includes("JOIN app.quiz_questions")) return [questionRow(values[0] as string)];
      throw new Error(`unexpected query: ${text}`);
    }) as never);
  }

  it("resumes after the furthest answered card when an earlier card was skipped", async () => {
    // regression: the index used to be the review count, which pointed back at
    // the already-answered second card and left the client stuck on a 409
    sessionState({ answered: [CARDS[1]] });

    const body = await (await resume()).json();

    expect(body).toMatchObject({
      currentIndex: 2,
      answeredCount: 1,
      completed: false,
      question: { card_id: CARDS[2] },
    });
    expect(body.question).not.toHaveProperty("user_id");
  });

  it("skips cards that were deleted since the session started", async () => {
    sessionState({ answered: [], existing: [CARDS[2]] });
    const body = await (await resume()).json();
    expect(body).toMatchObject({ currentIndex: 2, question: { card_id: CARDS[2] } });
  });

  it("reports a finished session as completed", async () => {
    sessionState({ answered: CARDS });
    const body = await (await resume()).json();
    expect(body).toMatchObject({ completed: true, currentIndex: 3, question: null });
  });

  it("rejects a malformed session id before querying", async () => {
    const res = await getSession(new NextRequest("http://localhost/api/quiz/sessions/nope"), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("GET /api/quiz/review-dates", () => {
  function reviewDates(search: string) {
    return getReviewDates(new NextRequest(`http://localhost/api/quiz/review-dates?${search}`));
  }

  it("returns plain day keys bucketed in the requested zone", async () => {
    vi.mocked(sql).mockResolvedValue([
      { review_date: "2026-09-30" },
      { review_date: "2026-10-01" },
      { review_date: "2026-10-08" },
    ] as never);

    const res = await reviewDates("start=2026-10-01&end=2026-10-07&tz=Europe%2FDublin");

    // rows from the padded edges of the scan are trimmed to the asked range
    expect(await res.json()).toEqual({ dates: ["2026-10-01"] });
    const [strings, ...values] = vi.mocked(sql).mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
    expect(query(strings)).toContain("to_char(created_at AT TIME ZONE ?");
    expect(values[0]).toBe("Europe/Dublin");
  });

  it("falls back to UTC for an unknown zone", async () => {
    vi.mocked(sql).mockResolvedValue([] as never);
    await reviewDates("start=2026-10-01&end=2026-10-07&tz=Mars%2FOlympus");
    expect(vi.mocked(sql).mock.calls[0][1]).toBe("UTC");
  });

  it.each([
    ["start=2026-10-01", "missing end"],
    ["start=yesterday&end=2026-10-07", "non-date start"],
    ["start=2026-02-30&end=2026-03-01", "impossible date"],
    ["start=2026-10-07&end=2026-10-01", "reversed range"],
    ["start=2020-01-01&end=2026-10-01", "range too long"],
  ])("rejects %s (%s) without querying", async (search) => {
    expect((await reviewDates(search)).status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });
});
