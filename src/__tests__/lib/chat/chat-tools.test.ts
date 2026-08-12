import { describe, expect, it } from "vitest";
import { createChatTools } from "@/lib/chat/build-stream";

describe("chat planning tools", () => {
  it("rejects malformed calendar timestamps before reaching persistence", async () => {
    const { tools } = createChatTools(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      null,
      {},
      false,
    );
    const addTimeBlock = tools.addTimeBlock;

    await expect(
      addTimeBlock.execute?.(
        {
          title: "Study",
          startsAt: "not-a-date",
          endsAt: "also-not-a-date",
        },
        {} as never,
      ),
    ).rejects.toThrow("valid ISO 8601 timestamps");
  });
});
