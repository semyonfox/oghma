import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql", () => {
  const tx = vi.fn();
  const sql = vi.fn() as ReturnType<typeof vi.fn> & {
    begin: ReturnType<typeof vi.fn>;
    __tx: ReturnType<typeof vi.fn>;
  };
  sql.begin = vi.fn(async (callback: (query: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );
  sql.__tx = tx;
  return { default: sql };
});

import sql from "@/database/pgsql";
import { advanceQuizStreak } from "@/lib/quiz/streak";

type MockSql = ReturnType<typeof vi.fn> & {
  begin: ReturnType<typeof vi.fn>;
  __tx: ReturnType<typeof vi.fn>;
};

const sqlMock = sql as unknown as MockSql;
const TODAY = new Date("2026-08-12T15:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  sqlMock.__tx.mockResolvedValue([]);
  sqlMock.begin.mockImplementation(
    async (callback: (query: typeof sqlMock.__tx) => Promise<unknown>) =>
      callback(sqlMock.__tx),
  );
});

describe("advanceQuizStreak", () => {
  it("creates the first streak day atomically", async () => {
    sqlMock.__tx.mockResolvedValueOnce([{ current_streak: 1 }]);

    await expect(advanceQuizStreak("user-1", TODAY)).resolves.toEqual({
      advanced: true,
      current_streak: 1,
      newMilestone: null,
    });

    const insert = sqlMock.__tx.mock.calls[0][0] as TemplateStringsArray;
    expect(insert.join(" ")).toContain("ON CONFLICT (user_id) DO NOTHING");
  });

  it("does not advance twice on the same UTC day", async () => {
    sqlMock.__tx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        current_streak: 6,
        longest_streak: 8,
        last_review_date: "2026-08-12",
        total_review_days: 12,
        streak_milestones: [],
      }]);

    await expect(advanceQuizStreak("user-1", TODAY)).resolves.toEqual({
      advanced: false,
      current_streak: 6,
      newMilestone: null,
    });
    expect(sqlMock.__tx).toHaveBeenCalledTimes(2);
    expect((sqlMock.__tx.mock.calls[1][0] as TemplateStringsArray).join(" "))
      .toContain("FOR UPDATE");
  });

  it("does not advance when postgres returns today's DATE as a Date", async () => {
    sqlMock.__tx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        current_streak: 6,
        longest_streak: 8,
        last_review_date: new Date("2026-08-12T00:00:00.000Z"),
        total_review_days: 12,
        streak_milestones: [],
      }]);

    await expect(advanceQuizStreak("user-1", TODAY)).resolves.toEqual({
      advanced: false,
      current_streak: 6,
      newMilestone: null,
    });
    expect(sqlMock.__tx).toHaveBeenCalledTimes(2);
  });

  it("advances consecutive days when postgres returns a DATE as a Date", async () => {
    sqlMock.__tx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        current_streak: 3,
        longest_streak: 5,
        last_review_date: new Date("2026-08-11T00:00:00.000Z"),
        total_review_days: 9,
        streak_milestones: [],
      }])
      .mockResolvedValueOnce([]);

    await expect(advanceQuizStreak("user-1", TODAY)).resolves.toEqual({
      advanced: true,
      current_streak: 4,
      newMilestone: null,
    });

    expect(sqlMock.__tx.mock.calls[2].slice(1)).toContain(4);
  });

  it("records a milestone exactly when its threshold is crossed", async () => {
    sqlMock.__tx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        current_streak: 6,
        longest_streak: 6,
        last_review_date: "2026-08-11",
        total_review_days: 6,
        streak_milestones: [],
      }])
      .mockResolvedValueOnce([]);

    await expect(advanceQuizStreak("user-1", TODAY)).resolves.toEqual({
      advanced: true,
      current_streak: 7,
      newMilestone: 7,
    });

    const updateValues = sqlMock.__tx.mock.calls[2].slice(1);
    expect(updateValues).toContain(7);
    expect(updateValues).toContain(
      JSON.stringify([{ days: 7, reached_at: TODAY.toISOString() }]),
    );
  });

  it("serializes concurrent requests into one daily advance", async () => {
    let row: {
      current_streak: number;
      longest_streak: number;
      last_review_date: string;
      total_review_days: number;
      streak_milestones: never[];
    } | null = null;
    let totalReviewDays = 0;
    let transactionTail = Promise.resolve();

    sqlMock.__tx.mockImplementation(
      async (strings: TemplateStringsArray) => {
        const query = strings.join(" ");
        if (query.includes("INSERT INTO app.user_streaks")) {
          if (row) return [];
          row = {
            current_streak: 1,
            longest_streak: 1,
            last_review_date: "2026-08-12",
            total_review_days: 1,
            streak_milestones: [],
          };
          totalReviewDays = 1;
          return [{ current_streak: 1 }];
        }
        if (query.includes("SELECT current_streak")) return [row];
        throw new Error(`Unexpected query: ${query}`);
      },
    );
    sqlMock.begin.mockImplementation(
      (callback: (query: typeof sqlMock.__tx) => Promise<unknown>) => {
        const transaction = transactionTail.then(() => callback(sqlMock.__tx));
        transactionTail = transaction.then(() => undefined, () => undefined);
        return transaction;
      },
    );

    const results = await Promise.all([
      advanceQuizStreak("user-1", TODAY),
      advanceQuizStreak("user-1", TODAY),
    ]);

    expect(results).toEqual([
      { advanced: true, current_streak: 1, newMilestone: null },
      { advanced: false, current_streak: 1, newMilestone: null },
    ]);
    expect(totalReviewDays).toBe(1);
  });

  // queues only the two reads when no update is expected, so nothing leaks
  // into the next test
  function existingStreak(lastReviewDate: string, currentStreak = 3, updates = true) {
    sqlMock.__tx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        current_streak: currentStreak,
        longest_streak: currentStreak,
        last_review_date: lastReviewDate,
        total_review_days: currentStreak,
        streak_milestones: [],
      }]);
    if (updates) sqlMock.__tx.mockResolvedValueOnce([]);
  }

  it("counts the day in the student's zone, not UTC", async () => {
    // 23:30 in Dublin on 12 August is already 13 August in Auckland
    const lateEvening = new Date("2026-08-12T22:30:00.000Z");
    existingStreak("2026-08-12");

    await expect(
      advanceQuizStreak("user-1", lateEvening, "Pacific/Auckland"),
    ).resolves.toMatchObject({ advanced: true, current_streak: 4 });
    expect(sqlMock.__tx.mock.calls[2].slice(1)).toContain("2026-08-13");
  });

  it("keeps a streak across the spring DST change", async () => {
    // Europe/Dublin skips 01:00-02:00 on 29 March 2026, a 23 hour day
    existingStreak("2026-03-28");

    await expect(
      advanceQuizStreak("user-1", new Date("2026-03-29T00:30:00.000Z"), "Europe/Dublin"),
    ).resolves.toMatchObject({ advanced: true, current_streak: 4 });
  });

  it("does not reset when a zone change puts today before the stored day", async () => {
    existingStreak("2026-08-13", 3, false);

    await expect(
      advanceQuizStreak("user-1", new Date("2026-08-13T02:00:00.000Z"), "America/Los_Angeles"),
    ).resolves.toEqual({ advanced: false, current_streak: 3, newMilestone: null });
    expect(sqlMock.__tx).toHaveBeenCalledTimes(2);
  });

  it("resets after a missed day", async () => {
    existingStreak("2026-08-10", 9);

    await expect(advanceQuizStreak("user-1", TODAY)).resolves.toMatchObject({
      advanced: true,
      current_streak: 1,
    });
  });
});
