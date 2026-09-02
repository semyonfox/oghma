import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  loadGeneration: vi.fn(),
  readEvents: vi.fn(),
  reader: { disconnect: vi.fn() },
}));

vi.mock("@/lib/api-error", () => ({
  withErrorHandler: (handler: unknown) => handler,
  requireAuth: vi.fn().mockResolvedValue({
    user_id: "22222222-2222-2222-2222-222222222222",
  }),
  requireValidId: (value: unknown) => value,
  tracedError: (message: string, status: number) =>
    Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/chat/generation-store", () => ({
  loadOwnedChatGeneration: mocks.loadGeneration,
  readChatGenerationEvents: mocks.readEvents,
}));

vi.mock("@/lib/redis", () => ({
  createBlockingRedisConnection: () => mocks.reader,
}));

import { GET } from "@/app/api/chat/generations/[id]/stream/route";

const generationId = "11111111-1111-1111-1111-111111111111";

describe("GET /api/chat/generations/[id]/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drains stored event batches after the generation is completed", async () => {
    mocks.loadGeneration
      .mockResolvedValueOnce({ id: generationId, status: "generating" })
      .mockResolvedValueOnce({ id: generationId, status: "completed" });
    mocks.readEvents
      .mockResolvedValueOnce([
        {
          id: "1-0",
          sse: 'event: token\ndata: {"text":"hello"}\n\n',
        },
      ])
      .mockResolvedValueOnce([
        { id: "2-0", sse: "event: done\ndata: {}\n\n" },
      ]);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/chat/generations/${generationId}/stream`,
      ),
      { params: Promise.resolve({ id: generationId }) },
    );
    const body = await response.text();

    expect(body).toContain("id: 1-0\nevent: token");
    expect(body).toContain("id: 2-0\nevent: done");
    expect(mocks.readEvents).toHaveBeenNthCalledWith(
      1,
      generationId,
      "0-0",
      15_000,
      mocks.reader,
    );
    expect(mocks.readEvents).toHaveBeenNthCalledWith(
      2,
      generationId,
      "1-0",
      15_000,
      mocks.reader,
    );
    expect(mocks.reader.disconnect).toHaveBeenCalledWith(false);
  });
});
