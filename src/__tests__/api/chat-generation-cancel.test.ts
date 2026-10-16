import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  loadGeneration: vi.fn(),
  cancel: vi.fn(),
  requestCancel: vi.fn(),
  revoke: vi.fn(),
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
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/chat/generation-store", () => ({
  cancelChatGeneration: mocks.cancel,
  loadOwnedChatGeneration: mocks.loadGeneration,
  requestChatGenerationCancel: mocks.requestCancel,
  revokeChatGeneration: mocks.revoke,
}));

import { POST } from "@/app/api/chat/generations/[id]/cancel/route";

const generationId = "11111111-1111-1111-1111-111111111111";

async function cancel() {
  const response = await POST(
    new NextRequest(
      `http://localhost/api/chat/generations/${generationId}/cancel`,
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: generationId }) },
  );
  return { status: response.status, body: await response.json() };
}

describe("POST /api/chat/generations/[id]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cancel.mockResolvedValue(false);
    mocks.requestCancel.mockResolvedValue(undefined);
  });

  it("reports a failed generation as settled instead of waiting for a worker", async () => {
    mocks.loadGeneration.mockResolvedValue({ id: generationId, status: "failed" });

    await expect(cancel()).resolves.toEqual({
      status: 200,
      body: { success: true, status: "failed" },
    });
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.requestCancel).not.toHaveBeenCalled();
  });

  it("settles work no worker owns in PostgreSQL even when Redis is down", async () => {
    mocks.loadGeneration.mockResolvedValue({ id: generationId, status: "queued" });
    mocks.cancel.mockResolvedValue(true);
    mocks.requestCancel.mockRejectedValue(new Error("Redis unavailable"));

    await expect(cancel()).resolves.toEqual({
      status: 200,
      body: { success: true, status: "cancelled" },
    });
    expect(mocks.cancel).toHaveBeenCalledWith(generationId);
    expect(mocks.requestCancel).not.toHaveBeenCalled();
  });

  it("flags a generation a live worker still owns", async () => {
    mocks.loadGeneration.mockResolvedValue({
      id: generationId,
      status: "generating",
    });

    await expect(cancel()).resolves.toEqual({
      status: 200,
      body: { success: true, status: "cancelling" },
    });
    expect(mocks.requestCancel).toHaveBeenCalledWith(generationId);
  });

  it("revokes a live worker's lease when Redis cannot carry the stop flag", async () => {
    mocks.loadGeneration.mockResolvedValue({
      id: generationId,
      status: "generating",
    });
    mocks.requestCancel.mockRejectedValue(new Error("Redis unavailable"));
    mocks.revoke.mockResolvedValue(true);

    await expect(cancel()).resolves.toEqual({
      status: 200,
      body: { success: true, status: "cancelled" },
    });
    expect(mocks.revoke).toHaveBeenCalledWith(generationId);
  });

  it("hides generations owned by another account", async () => {
    mocks.loadGeneration.mockResolvedValue(null);

    await expect(cancel()).resolves.toMatchObject({ status: 404 });
    expect(mocks.loadGeneration).toHaveBeenCalledWith(
      generationId,
      "22222222-2222-2222-2222-222222222222",
    );
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
});
