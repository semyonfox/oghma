import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CreateNoteWithTreeInput } from "@/lib/notes/storage/create-note";

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  createNoteWithTree: vi.fn(),
  replaceNoteLinks: vi.fn(),
  cacheInvalidate: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ validateSession: mocks.validateSession }));
vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/logger", () => ({
  default: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/utils/uuid", () => ({
  generateUUID: () => "00000000-0000-4000-8000-000000000001",
}));
vi.mock("@/lib/notes/storage/create-note", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/notes/storage/create-note")>(),
  createNoteWithTree: mocks.createNoteWithTree,
}));
vi.mock("@/lib/notes/storage/note-links", () => ({
  replaceNoteLinks: mocks.replaceNoteLinks,
}));
vi.mock("@/lib/cache", () => ({
  cacheInvalidate: mocks.cacheInvalidate,
  cacheKeys: {
    treeChildren: (userId: string, parentId: string | null) =>
      `children:${userId}:${parentId ?? "root"}`,
    treeFull: (userId: string) => `tree:${userId}`,
    notesList: (userId: string) => `notes:${userId}`,
  },
}));

import { POST } from "@/app/api/notes/route";
import { InvalidNoteParentError } from "@/lib/notes/storage/create-note";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOTE_ID = "22222222-2222-4222-8222-222222222222";
const PARENT_ID = "33333333-3333-4333-8333-333333333333";
const CREATED_AT = new Date("2026-09-13T12:00:00Z");

function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/notes", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }));
}

describe("POST /api/notes creation contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.validateSession.mockResolvedValue({ user_id: USER_ID });
    mocks.createNoteWithTree.mockImplementation(async (input: CreateNoteWithTreeInput) => ({
      ...input,
      s3Key: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT.toISOString(),
    }));
    mocks.replaceNoteLinks.mockResolvedValue(undefined);
    mocks.cacheInvalidate.mockResolvedValue(undefined);
  });

  it("uses the shared write with the optimistic ID and preserves the public response", async () => {
    const response = await post({
      id: NOTE_ID,
      pid: PARENT_ID,
      title: "Lecture notes",
      content: "# Lecture",
      userId: "untrusted-owner",
    });

    expect(response.status).toBe(201);
    expect(mocks.createNoteWithTree).toHaveBeenCalledExactlyOnceWith({
      noteId: NOTE_ID,
      userId: USER_ID,
      parentId: PARENT_ID,
      title: "Lecture notes",
      content: "# Lecture",
      isFolder: false,
    });
    await expect(response.json()).resolves.toEqual({
      id: NOTE_ID,
      pid: PARENT_ID,
      title: "Lecture notes",
      content: "# Lecture",
      isFolder: false,
      deleted: 0,
      shared: 0,
      pinned: 0,
      editorsize: null,
      createdAt: CREATED_AT.toISOString(),
      updatedAt: CREATED_AT.toISOString(),
    });
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.replaceNoteLinks).toHaveBeenCalledExactlyOnceWith(USER_ID, NOTE_ID, "# Lecture");
    expect(mocks.cacheInvalidate).toHaveBeenCalledExactlyOnceWith(
      `children:${USER_ID}:${PARENT_ID}`, `tree:${USER_ID}`, `notes:${USER_ID}`,
    );
  });

  it.each([
    { body: {}, title: "Untitled", isFolder: false },
    { body: { title: "", content: "", pid: null }, title: "Untitled", isFolder: false },
    { body: { isFolder: true }, title: "New Folder", isFolder: true },
    { body: { is_folder: true }, title: "New Folder", isFolder: true },
    { body: { isFolder: false, is_folder: true }, title: "New Folder", isFolder: true },
  ])("preserves creation defaults for $body", async ({ body, title, isFolder }) => {
    const response = await post(body);

    expect(response.status).toBe(201);
    expect(mocks.createNoteWithTree).toHaveBeenCalledExactlyOnceWith({
      noteId: "00000000-0000-4000-8000-000000000001",
      userId: USER_ID,
      parentId: null,
      title,
      content: "\n",
      isFolder,
    });
    await expect(response.json()).resolves.not.toHaveProperty("pid");
    expect(mocks.replaceNoteLinks).not.toHaveBeenCalled();
    expect(mocks.cacheInvalidate).toHaveBeenCalledExactlyOnceWith(
      `children:${USER_ID}:root`, `tree:${USER_ID}`, `notes:${USER_ID}`,
    );
  });

  it("requires authentication before writing", async () => {
    mocks.validateSession.mockResolvedValue(null);

    expect((await post({ title: "Notes" })).status).toBe(401);
    expect(mocks.createNoteWithTree).not.toHaveBeenCalled();
  });

  it.each([
    { id: "invalid" },
    { pid: "invalid" },
    { title: "x".repeat(501) },
    { isFolder: "true" },
  ])("rejects invalid input before writing", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(mocks.createNoteWithTree).not.toHaveBeenCalled();
    expect(mocks.cacheInvalidate).not.toHaveBeenCalled();
  });

  it("maps the shared parent error to the existing 404 response without side effects", async () => {
    mocks.createNoteWithTree.mockRejectedValue(new InvalidNoteParentError());

    const response = await post({ pid: PARENT_ID, content: "Body" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "Parent folder not found" });
    expect(mocks.replaceNoteLinks).not.toHaveBeenCalled();
    expect(mocks.cacheInvalidate).not.toHaveBeenCalled();
  });

  it("reports other write failures as server errors without indexing or invalidating", async () => {
    mocks.createNoteWithTree.mockRejectedValue(new Error("tree insert failed"));

    const response = await post({ content: "Body" });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: "Internal server error" });
    expect(mocks.replaceNoteLinks).not.toHaveBeenCalled();
    expect(mocks.cacheInvalidate).not.toHaveBeenCalled();
  });

  it("still returns the created note and invalidates caches if link indexing fails", async () => {
    mocks.replaceNoteLinks.mockRejectedValue(new Error("link index unavailable"));

    expect((await post({ content: "Body" })).status).toBe(201);
    expect(mocks.cacheInvalidate).toHaveBeenCalledOnce();
  });
});
