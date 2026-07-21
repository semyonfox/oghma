import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sqlMock = vi.hoisted(() => vi.fn());
const loadGenerationMock = vi.hoisted(() => vi.fn());
const requestCancelMock = vi.hoisted(() => vi.fn());

vi.mock("@/database/pgsql.js", () => ({ default: sqlMock }));
vi.mock("@/lib/auth", () => ({
  validateSession: vi.fn().mockResolvedValue({
    user_id: "22222222-2222-2222-2222-222222222222",
  }),
}));
vi.mock("@/lib/api-error", () => ({
  withErrorHandler: (handler: unknown) => handler,
  tracedError: (message: string, status: number) =>
    Response.json({ error: message }, { status }),
}));
vi.mock("@/lib/utils/uuid", () => ({ isValidUUID: () => true }));
vi.mock("@/lib/chat/generation-store", () => ({
  loadOwnedChatGeneration: loadGenerationMock,
  requestChatGenerationCancel: requestCancelMock,
}));

import { DELETE } from "@/app/api/chat/sessions/[id]/route";

const sessionId = "11111111-1111-1111-1111-111111111111";

describe("DELETE /api/chat/sessions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlMock.mockResolvedValue([]);
  });

  it("deletes an idle session immediately", async () => {
    sqlMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: sessionId }]);

    const response = await DELETE(
      new NextRequest(`http://localhost/api/chat/sessions/${sessionId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: sessionId }) },
    );

    expect(response.status).toBe(200);
    expect(requestCancelMock).not.toHaveBeenCalled();
  });

  it("waits for an active generation to cancel before deleting", async () => {
    const generationId = "33333333-3333-3333-3333-333333333333";
    sqlMock
      .mockResolvedValueOnce([{ id: generationId }])
      .mockResolvedValueOnce([{ id: sessionId }]);
    loadGenerationMock.mockResolvedValueOnce({
      id: generationId,
      status: "cancelled",
    });

    const response = await DELETE(
      new NextRequest(`http://localhost/api/chat/sessions/${sessionId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: sessionId }) },
    );

    expect(response.status).toBe(200);
    expect(requestCancelMock).toHaveBeenCalledWith(generationId);
    expect(loadGenerationMock).toHaveBeenCalledWith(
      generationId,
      "22222222-2222-2222-2222-222222222222",
    );
  });
});
