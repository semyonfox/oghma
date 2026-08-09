import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-error", () => {
  class ApiError extends Error {
    constructor(
      public statusCode: number,
      public userMessage: string,
    ) {
      super(userMessage);
    }
  }
  return {
    ApiError,
    requireAuth: vi.fn(),
    requireValidId: vi.fn((value: unknown) => {
      if (typeof value !== "string") throw new ApiError(400, "Invalid Trash item ID");
      return value;
    }),
    withErrorHandler: (handler: (request: NextRequest) => Promise<Response>) =>
      async (request: NextRequest) => {
        try {
          return await handler(request);
        } catch (error) {
          const known = error as { statusCode?: number; userMessage?: string };
          return Response.json(
            { error: known.userMessage ?? "Internal server error" },
            { status: known.statusCode ?? 500 },
          );
        }
      },
  };
});

vi.mock("@/lib/notes/storage/note-lifecycle", () => ({
  emptyTrash: vi.fn(),
  listTrashRoots: vi.fn(),
  permanentlyDeleteTrashRoot: vi.fn(),
  restoreTrashRoot: vi.fn(),
}));

import { requireAuth } from "@/lib/api-error";
import {
  emptyTrash,
  listTrashRoots,
  permanentlyDeleteTrashRoot,
  restoreTrashRoot,
} from "@/lib/notes/storage/note-lifecycle";
import { GET, POST } from "@/app/api/trash/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ROOT_ID = "22222222-2222-4222-8222-222222222222";

describe("Trash API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: USER_ID } as never);
    vi.mocked(listTrashRoots).mockResolvedValue([]);
    vi.mocked(emptyTrash).mockResolvedValue(0);
  });

  it("lists only Trash roots", async () => {
    vi.mocked(listTrashRoots).mockResolvedValue([
      {
        id: ROOT_ID,
        title: "Module notes",
        isFolder: true,
        deletedAt: "2026-08-01T00:00:00.000Z",
        purgeAt: "2026-08-31T00:00:00.000Z",
        originalPath: ["CS101"],
        descendantCount: 4,
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/trash"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [{ id: ROOT_ID, descendantCount: 4 }],
    });
  });

  it("restores an entire root bundle", async () => {
    vi.mocked(restoreTrashRoot).mockResolvedValue({
      rootId: ROOT_ID,
      noteIds: [ROOT_ID, "33333333-3333-4333-8333-333333333333"],
      purgeAt: "2026-08-31T00:00:00.000Z",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/trash", {
        method: "POST",
        body: JSON.stringify({ action: "restore", id: ROOT_ID }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(restoreTrashRoot).toHaveBeenCalledWith(USER_ID, ROOT_ID);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      itemsRestored: 2,
    });
  });

  it("keeps Empty Trash separate from ordinary deletion", async () => {
    vi.mocked(emptyTrash).mockResolvedValue(3);
    const response = await POST(
      new NextRequest("http://localhost/api/trash", {
        method: "POST",
        body: JSON.stringify({ action: "empty" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(emptyTrash).toHaveBeenCalledWith(USER_ID);
    expect(permanentlyDeleteTrashRoot).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      deletedRoots: 3,
    });
  });
});
