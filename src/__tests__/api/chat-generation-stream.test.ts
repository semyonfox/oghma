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
      1,
      mocks.reader,
    );
    expect(mocks.reader.disconnect).toHaveBeenCalledWith(false);
  });

  it.each(["completed", "cancelled"] as const)(
    "finishes from durable %s state when Redis has no done event",
    async (status) => {
      mocks.loadGeneration.mockResolvedValue({
        id: generationId,
        status,
        error_message: null,
      });
      mocks.readEvents.mockResolvedValue([]);

      const response = await GET(
        new NextRequest(
          `http://localhost/api/chat/generations/${generationId}/stream`,
        ),
        { params: Promise.resolve({ id: generationId }) },
      );
      const body = await response.text();

      expect(body).toContain("event: done\ndata: {}");
      expect(mocks.readEvents).toHaveBeenCalledOnce();
      expect(mocks.readEvents).toHaveBeenCalledWith(
        generationId,
        "0-0",
        1,
        mocks.reader,
      );
    },
  );

  it("drains terminal replay from the requested cursor before synthesizing done", async () => {
    mocks.loadGeneration.mockResolvedValue({
      id: generationId,
      status: "completed",
      error_message: null,
    });
    mocks.readEvents
      .mockResolvedValueOnce([
        {
          id: "8-0",
          sse: 'event: token\ndata: {"text":"replayed"}\n\n',
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/chat/generations/${generationId}/stream?after=7-0`,
      ),
      { params: Promise.resolve({ id: generationId }) },
    );
    const body = await response.text();

    expect(body.indexOf("id: 8-0\nevent: token")).toBeLessThan(
      body.indexOf("event: done"),
    );
    expect(mocks.readEvents).toHaveBeenNthCalledWith(
      1,
      generationId,
      "7-0",
      1,
      mocks.reader,
    );
    expect(mocks.readEvents).toHaveBeenNthCalledWith(
      2,
      generationId,
      "8-0",
      1,
      mocks.reader,
    );
  });

  it("emits the durable failure after replay is drained", async () => {
    mocks.loadGeneration.mockResolvedValue({
      id: generationId,
      status: "failed",
      error_message: "Provider unavailable",
    });
    mocks.readEvents.mockResolvedValue([]);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/chat/generations/${generationId}/stream`,
      ),
      { params: Promise.resolve({ id: generationId }) },
    );
    const body = await response.text();

    expect(body).toContain(
      'event: error\ndata: {"message":"Provider unavailable"}',
    );
    expect(mocks.readEvents).toHaveBeenCalledWith(
      generationId,
      "0-0",
      1,
      mocks.reader,
    );
  });
});
