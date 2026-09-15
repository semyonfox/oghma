/**
 * Notes API route tests
 *
 * Strategy: mock the DB (pgsql) and auth (validateSession) at the module level,
 * then import the route handlers and call them directly with synthetic Requests.
 */
// The route suite deliberately exercises legacy Trash bundle responses while
// the production source is migrated to typed modules.
// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- mocks must be hoisted above imports ---

vi.mock("@/database/pgsql", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  sqlMock.begin = vi.fn(async (callback) => callback(sqlMock));
  return { default: sqlMock };
});

vi.mock("@/lib/auth", () => ({
  validateSession: vi.fn(),
  createSuccessResponse: vi.fn(),
  createErrorResponse: vi.fn(),
  createValidationErrorResponse: vi.fn(),
  parseJsonBody: vi.fn(),
  generateJWTToken: vi.fn(),
  verifyJWTToken: vi.fn(),
  createSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
  createAuthSession: vi.fn(),
}));

vi.mock("@/lib/notes/storage/pg-tree", () => ({
  addNoteToTree: vi.fn().mockResolvedValue(undefined),
  removeNoteFromTree: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notes/storage/pdf-annotations", () => ({
  deleteNoteAnnotations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notes/storage/note-lifecycle", () => ({
  moveSubtreeToTrash: vi.fn(),
}));

vi.mock("@/lib/utils/uuid", () => ({
  isValidUUID: vi.fn().mockReturnValue(true),
  generateUUID: vi.fn().mockReturnValue("00000000-0000-0000-0000-000000000001"),
}));

vi.mock("@/lib/notes/utils/filter-fields", () => ({
  filterNoteFields: vi.fn((note) => note),
}));

import { GET as notesGET } from "@/app/api/notes/route";
import {
  GET as noteGET,
  PUT as notePUT,
  PATCH as notePATCH,
  DELETE as noteDELETE,
} from "@/app/api/notes/[id]/route";
import { validateSession } from "@/lib/auth";
import sql from "@/database/pgsql";
import { moveSubtreeToTrash } from "@/lib/notes/storage/note-lifecycle";

const MOCK_USER = { user_id: "user-uuid-1", email: "test@example.com" };

const NOTE_ROW = {
  note_id: "note-uuid-1",
  title: "Test Note",
  content: "# Hello",
  is_folder: false,
  deleted: 0,
  shared: 0,
  pinned: 0,
  created_at: new Date("2025-01-01"),
  updated_at: new Date("2025-01-01"),
};

function makeRequest(method, url, body) {
  const init = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(url, init);
}

beforeEach(() => {
  vi.clearAllMocks();
  validateSession.mockResolvedValue(MOCK_USER);
  sql.mockResolvedValue([]);
  moveSubtreeToTrash.mockResolvedValue({
    rootId: "note-uuid-1",
    noteIds: ["note-uuid-1"],
    purgeAt: "2026-09-01T00:00:00.000Z",
  });
});

// ─── GET /api/notes ────────────────────────────────────────────────────────

describe("GET /api/notes", () => {
  it("returns 401 when not authenticated", async () => {
    validateSession.mockResolvedValue(null);
    const req = makeRequest("GET", "http://localhost/api/notes");
    const res = await notesGET(req);
    expect(res.status).toBe(401);
  });

  it("returns empty array when user has no notes", async () => {
    sql.mockResolvedValue([]);
    const req = makeRequest("GET", "http://localhost/api/notes");
    const res = await notesGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns mapped notes for authenticated user", async () => {
    sql.mockResolvedValue([NOTE_ROW]);
    const req = makeRequest("GET", "http://localhost/api/notes");
    const res = await notesGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("note-uuid-1");
    expect(body[0].title).toBe("Test Note");
    expect(body[0].isFolder).toBe(false);
  });
});

// ─── GET /api/notes/[id] ──────────────────────────────────────────────────

describe("GET /api/notes/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    validateSession.mockResolvedValue(null);
    const req = makeRequest("GET", "http://localhost/api/notes/note-uuid-1");
    const res = await noteGET(req, {
      params: Promise.resolve({ id: "note-uuid-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when note does not exist", async () => {
    moveSubtreeToTrash.mockResolvedValue(null);
    const req = makeRequest("GET", "http://localhost/api/notes/note-uuid-1");
    const res = await noteGET(req, {
      params: Promise.resolve({ id: "note-uuid-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns the note when found", async () => {
    sql.mockResolvedValue([NOTE_ROW]);
    const req = makeRequest("GET", "http://localhost/api/notes/note-uuid-1");
    const res = await noteGET(req, {
      params: Promise.resolve({ id: "note-uuid-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("note-uuid-1");
  });
});

// ─── PUT /api/notes/[id] ──────────────────────────────────────────────────

describe("PUT /api/notes/[id]", () => {
  it("returns 404 when note does not exist", async () => {
    sql.mockResolvedValue([]);
    const req = makeRequest("PUT", "http://localhost/api/notes/note-uuid-1", {
      title: "Updated",
    });
    const res = await notePUT(req, {
      params: Promise.resolve({ id: "note-uuid-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("updates and returns the note", async () => {
    const updatedRow = { ...NOTE_ROW, title: "Updated Title" };
    // first call = SELECT existing, second call = UPDATE RETURNING
    sql.mockResolvedValueOnce([NOTE_ROW]).mockResolvedValueOnce([updatedRow]);
    const req = makeRequest("PUT", "http://localhost/api/notes/note-uuid-1", {
      title: "Updated Title",
    });
    const res = await notePUT(req, {
      params: Promise.resolve({ id: "note-uuid-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Updated Title");
  });
});

describe("PATCH /api/notes/[id]", () => {
  it("accepts partial note updates through the same handler", async () => {
    const updatedRow = { ...NOTE_ROW, content: "# Updated" };
    sql.mockResolvedValueOnce([NOTE_ROW]).mockResolvedValueOnce([updatedRow]);

    const req = makeRequest("PATCH", "http://localhost/api/notes/note-uuid-1", {
      content: "# Updated",
    });
    const res = await notePATCH(req, {
      params: Promise.resolve({ id: "note-uuid-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBe("# Updated");
  });

  it("persists pin changes and returns the stored pin state", async () => {
    const pinnedRow = { ...NOTE_ROW, pinned: 1 };
    sql.mockResolvedValueOnce([NOTE_ROW]).mockResolvedValueOnce([pinnedRow]);

    const req = makeRequest("PATCH", "http://localhost/api/notes/note-uuid-1", {
      pinned: 1,
    });
    const res = await notePATCH(req, {
      params: Promise.resolve({ id: "note-uuid-1" }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).pinned).toBe(1);
    expect(sql.mock.calls[1][0].join(" ")).toContain("pinned =");
    expect(sql.mock.calls[1].slice(1)).toContain(1);
  });
});

// ─── DELETE /api/notes/[id] ───────────────────────────────────────────────

describe("DELETE /api/notes/[id]", () => {
  it("returns 404 when note does not exist", async () => {
    moveSubtreeToTrash.mockResolvedValue(null);
    const req = makeRequest("DELETE", "http://localhost/api/notes/note-uuid-1");
    const res = await noteDELETE(req, {
      params: Promise.resolve({ id: "note-uuid-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("moves the note into a reversible Trash bundle", async () => {
    const req = makeRequest("DELETE", "http://localhost/api/notes/note-uuid-1");
    const res = await noteDELETE(req, {
      params: Promise.resolve({ id: "note-uuid-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.itemsMoved).toBe(1);
    expect(moveSubtreeToTrash).toHaveBeenCalledWith(
      MOCK_USER.user_id,
      "note-uuid-1",
    );
  });
});
