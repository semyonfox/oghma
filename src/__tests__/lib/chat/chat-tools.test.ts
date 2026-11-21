import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildChatPrompt, createChatTools } from "@/lib/chat/build-stream";

const sql = vi.hoisted(() => vi.fn());
vi.mock("@/database/pgsql", () => ({ default: sql }));

describe("chat planning tools", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  const sessionId = "22222222-2222-2222-2222-222222222222";

  beforeEach(() => {
    sql.mockReset();
  });

  it.each([
    ["not-a-date", "2026-10-06T11:00:00Z", "valid ISO 8601 timestamps"],
    ["2026-10-06T10:00:00Z", "2026-10-06T09:00:00Z", "End must be after start"],
  ])("rejects the range %s to %s before reaching persistence", async (startsAt, endsAt, error) => {
    await expect(
      createChatTools(userId, sessionId, null, {}, false).executeApprovedAction("addTimeBlock", {
        title: "Study",
        startsAt,
        endsAt,
      }),
    ).rejects.toThrow(error);
    expect(sql).not.toHaveBeenCalled();
  });

  it("writes an approved calendar block in UTC under the requesting account", async () => {
    const startsAt = "2026-10-06T09:00:00.000Z";
    const endsAt = "2026-10-06T10:00:00.000Z";
    sql.mockResolvedValueOnce([{
      id: "block-id",
      title: "Study",
      starts_at: startsAt,
      ends_at: endsAt,
      pomodoro_count: 2,
    }]);

    const block = await createChatTools(userId, sessionId, null, {}, false)
      .executeApprovedAction("addTimeBlock", {
        title: "Study",
        startsAt: "2026-10-06T10:00:00+01:00",
        endsAt: "2026-10-06T11:00:00+01:00",
      });

    expect(sql).toHaveBeenCalledWith(expect.any(Array), userId, null, "Study", startsAt, endsAt, 2);
    expect(block).toEqual({
      blockId: "block-id",
      title: "Study",
      startsAt,
      endsAt,
      pomodoroCount: 2,
    });
  });
});

describe("buildChatPrompt", () => {
  it("keeps system content in instructions and out of messages", () => {
    const prompt = buildChatPrompt({
      systemPrompt: "Base instructions",
      sessionMemoryPrompt: "Remember the active course",
      toolInstruction: "Use note tools when needed",
      history: [
        { role: "system", content: "Preserve the user's formatting" },
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
      ],
      message: "Current question",
    });

    expect(prompt.instructions).toBe(
      "Base instructions\n\n" +
        "Remember the active course\n\n" +
        "Use note tools when needed\n\n" +
        "Preserve the user's formatting",
    );
    expect(prompt.messages).toEqual([
      { role: "user", content: "Earlier question" },
      { role: "assistant", content: "Earlier answer" },
      { role: "user", content: "Current question" },
    ]);
    expect(prompt.messages).not.toContainEqual(
      expect.objectContaining({ role: "system" }),
    );
  });
});
