import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type TestRouteHandler = (
  request: NextRequest,
  context: unknown,
) => Promise<Response>;

const mocks = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(
      public statusCode: number,
      public userMessage: string,
    ) {
      super(userMessage);
    }
  }
  class TreeCycleError extends Error {}
  class TreeParentError extends Error {}
  class TreeItemUnavailableError extends Error {}
  class TreeMoveConflictError extends Error {}

  return {
    ApiError,
    TreeCycleError,
    TreeParentError,
    TreeItemUnavailableError,
    TreeMoveConflictError,
    cacheInvalidate: vi.fn(),
    moveNoteInTree: vi.fn(),
    parseJsonObject: vi.fn((request: Request) => request.json()),
    requireAuth: vi.fn(),
    requireValidId: vi.fn((value: string) => value),
    updateTreeItem: vi.fn(),
  };
});

vi.mock("@/lib/api-error", () => ({
  ApiError: mocks.ApiError,
  parseJsonObject: mocks.parseJsonObject,
  requireAuth: mocks.requireAuth,
  requireValidId: mocks.requireValidId,
  withErrorHandler:
    (handler: TestRouteHandler) =>
    async (request: NextRequest, context?: unknown) => {
      try {
        return await handler(request, context);
      } catch (error) {
        if (error instanceof mocks.ApiError) {
          return Response.json(
            { error: error.userMessage },
            { status: error.statusCode },
          );
        }
        throw error;
      }
    },
}));
vi.mock("@/lib/notes/storage/pg-tree", () => ({
  moveNoteInTree: mocks.moveNoteInTree,
  TreeCycleError: mocks.TreeCycleError,
  TreeItemUnavailableError: mocks.TreeItemUnavailableError,
  TreeMoveConflictError: mocks.TreeMoveConflictError,
  TreeParentError: mocks.TreeParentError,
  updateTreeItem: mocks.updateTreeItem,
}));
vi.mock("@/lib/cache", () => ({
  cacheInvalidate: mocks.cacheInvalidate,
  cacheKeys: {
    treeChildren: (userId: string, parentId: string | null) =>
      `children:${userId}:${parentId ?? "root"}`,
    treeFull: (userId: string) => `tree:${userId}`,
  },
}));

import { parseTreeMutation, POST } from "@/app/api/tree/route";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const NOTE_ID = "22222222-2222-2222-2222-222222222222";
const FOLDER_ID = "33333333-3333-3333-3333-333333333333";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/tree", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("tree mutation boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user_id: USER_ID });
    mocks.cacheInvalidate.mockResolvedValue(undefined);
  });

  it.each([
    {},
    { action: "mutate", data: { id: NOTE_ID } },
    { action: "move", data: { noteId: NOTE_ID, parentId: null } },
    {
      action: "move",
      data: { noteId: NOTE_ID, expectedParentId: null, parentId: 1 },
    },
  ])("rejects malformed mutations before storage work", (body) => {
    try {
      parseTreeMutation(body);
      throw new Error("Expected tree mutation parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(mocks.ApiError);
      expect(error).toMatchObject({ statusCode: 400 });
    }
  });

  it("persists expansion state and invalidates the containing child list", async () => {
    mocks.updateTreeItem.mockResolvedValue(FOLDER_ID);

    const response = await POST(
      post({ action: "mutate", data: { id: NOTE_ID, isExpanded: true } }),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateTreeItem).toHaveBeenCalledWith(USER_ID, NOTE_ID, {
      isExpanded: true,
    });
    expect(mocks.cacheInvalidate).toHaveBeenCalledWith(
      `children:${USER_ID}:${FOLDER_ID}`,
      `tree:${USER_ID}`,
    );
  });

  it("moves the named item and returns the parents confirmed by storage", async () => {
    mocks.moveNoteInTree.mockResolvedValue({
      success: true,
      noteId: NOTE_ID,
      oldParentId: null,
      newParentId: FOLDER_ID,
    });

    const response = await POST(
      post({
        action: "move",
        data: {
          noteId: NOTE_ID,
          expectedParentId: null,
          parentId: FOLDER_ID,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.moveNoteInTree).toHaveBeenCalledWith(
      USER_ID,
      NOTE_ID,
      FOLDER_ID,
      null,
    );
    expect(mocks.cacheInvalidate).toHaveBeenCalledWith(
      `children:${USER_ID}:root`,
      `children:${USER_ID}:${FOLDER_ID}`,
      `tree:${USER_ID}`,
    );
    await expect(response.json()).resolves.toEqual({
      success: true,
      noteId: NOTE_ID,
      oldParentId: null,
      newParentId: FOLDER_ID,
    });
  });

  it("maps a stale expected parent to a conflict", async () => {
    mocks.moveNoteInTree.mockRejectedValue(new mocks.TreeMoveConflictError());

    const response = await POST(
      post({
        action: "move",
        data: {
          noteId: NOTE_ID,
          expectedParentId: null,
          parentId: FOLDER_ID,
        },
      }),
    );

    expect(response.status).toBe(409);
    expect(mocks.cacheInvalidate).not.toHaveBeenCalled();
  });

  it("maps a missing named item to not found", async () => {
    mocks.moveNoteInTree.mockRejectedValue(
      new mocks.TreeItemUnavailableError(),
    );

    const response = await POST(
      post({
        action: "move",
        data: {
          noteId: NOTE_ID,
          expectedParentId: null,
          parentId: FOLDER_ID,
        },
      }),
    );

    expect(response.status).toBe(404);
  });
});
