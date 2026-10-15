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

import { POST } from "@/app/api/tree/route";
import { parseTreeMutation } from "@/lib/notes/tree-mutation";

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

  it("persists expansion state", async () => {
    mocks.updateTreeItem.mockResolvedValue(undefined);

    const response = await POST(
      post({ action: "mutate", data: { id: NOTE_ID, isExpanded: true } }),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateTreeItem).toHaveBeenCalledWith(USER_ID, NOTE_ID, {
      isExpanded: true,
    });
  });

  it("reports expanding a folder trashed in another tab as not found", async () => {
    mocks.updateTreeItem.mockRejectedValue(new mocks.TreeItemUnavailableError());

    const response = await POST(
      post({ action: "mutate", data: { id: NOTE_ID, isExpanded: true } }),
    );

    expect(response.status).toBe(404);
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
