import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({ validateSession: vi.fn() }));
vi.mock("@/lib/api-error", () => ({
  withErrorHandler: (handler: unknown) => handler,
  tracedError: (error: string, status: number) =>
    Response.json({ error }, { status }),
}));

import sql from "@/database/pgsql";
import { validateSession } from "@/lib/auth";
import { GET } from "@/app/api/ingestion-status/route";

const NOTE_ID = "11111111-1111-4111-8111-111111111111";

function request() {
  return new NextRequest(
    `http://localhost/api/ingestion-status?noteId=${NOTE_ID}`,
  );
}

describe("PDF ingestion status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateSession).mockResolvedValue({ user_id: "user-1" } as never);
  });

  it("reports a direct upload as pending until its companion exists", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([{
        status: "processing",
        chunks_stored: 0,
        created_at: "2026-09-24T12:00:00Z",
        updated_at: "2026-09-24T12:00:05Z",
      }] as never)
      .mockResolvedValueOnce([] as never);

    const response = await GET(request());
    const body = await response.json();

    expect(body.status).toBe("processing");
    expect(body.extractedNote).toBeNull();
  });

  it("reports an editable companion when indexing finishes", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([{ status: "done", chunks_stored: 2 }] as never)
      .mockResolvedValueOnce([{
        note_id: "22222222-2222-4222-8222-222222222222",
        title: "lecture.md",
        folder_id: "33333333-3333-4333-8333-333333333333",
      }] as never);

    const response = await GET(request());
    const body = await response.json();

    expect(body.status).toBe("done");
    expect(body.extractedNote).toEqual({
      id: "22222222-2222-4222-8222-222222222222",
      title: "lecture.md",
    });
    expect(body.folderId).toBe("33333333-3333-4333-8333-333333333333");
  });

  it("does not show an older companion while a new job is processing", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([{ status: "processing", chunks_stored: 0 }] as never)
      .mockResolvedValueOnce([{
        note_id: "22222222-2222-4222-8222-222222222222",
        title: "lecture.md",
        folder_id: null,
      }] as never);

    const response = await GET(request());
    const body = await response.json();

    expect(body.status).toBe("processing");
    expect(body.extractedNote).toBeNull();
  });

  it("reports a restricted Canvas PDF as failed without losing its source", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ status: "forbidden" }] as never)
      .mockResolvedValueOnce([] as never);

    const response = await GET(request());
    const body = await response.json();

    expect(body.status).toBe("failed");
    expect(body.extractedNote).toBeNull();
  });

  it("does not read another user's note without a session", async () => {
    vi.mocked(validateSession).mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });
});
