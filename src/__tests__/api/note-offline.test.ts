import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), sql: vi.fn() }));
vi.mock("@/lib/auth", () => ({ validateSession: mocks.auth }));
vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
import { GET } from "@/app/api/notes/[id]/offline/route";

const ownerId = "550e8400-e29b-41d4-a716-446655440000";
const id = "550e8400-e29b-41d4-a716-446655440001";
const request = () =>
  GET(new NextRequest(`https://oghmanotes.ie/api/notes/${id}/offline`), {
    params: Promise.resolve({ id }),
  });

describe("offline note snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user_id: ownerId });
    mocks.sql.mockResolvedValue([
      { note_id: id, title: "Synthetic note", content: "# Saved text" },
    ]);
  });
  it("binds a read-only snapshot to the authenticated owner and disables HTTP caching", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      ownerId,
      note: {
        id,
        title: "Synthetic note",
        content: "# Saved text",
        savedAt: expect.any(String),
      },
    });
    const [parts, noteId, userId] = mocks.sql.mock.calls[0];
    expect(noteId).toBe(id);
    expect(userId).toBe(ownerId);
    expect(parts.join("?")).toContain(
      "AND deleted_at IS NULL AND is_folder = false AND s3_key IS NULL",
    );
  });
  it("rejects unauthenticated requests before reading notes", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("does not return inaccessible, deleted or attachment notes", async () => {
    mocks.sql.mockResolvedValue([]);
    expect((await request()).status).toBe(404);
  });
  it("bounds the snapshot before sending it through the mobile bridge", async () => {
    mocks.sql.mockResolvedValue([
      { note_id: id, title: "Large", content: "a".repeat(200_001) },
    ]);
    expect((await request()).status).toBe(413);
  });
});
