import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type TestRouteHandler = (
  request: NextRequest,
  context: unknown,
) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/lib/api-error", async () => ({
  requireValidId: (value: unknown) => {
    if (typeof value === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
      return value;
    }
    throw Object.assign(new Error("Invalid ID"), { statusCode: 400 });
  },
  requireAuth: mocks.requireAuth,
  withErrorHandler:
    (handler: TestRouteHandler) =>
    async (request: NextRequest, context?: unknown) => handler(request, context),
  ApiError: class extends Error {
    constructor(
      public statusCode: number,
      public userMessage: string,
    ) {
      super(userMessage);
    }
  },
}));

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));

import { GET } from "@/app/api/tree/children/route";

describe("GET /api/tree/children", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user_id: "user-123" });
  });

  it("sorts numbered titles naturally", async () => {
    mocks.sql.mockResolvedValue([
      { id: "week-10", title: "Week 10", isFolder: true, isExpanded: false, s3Key: null, mimeType: null, pinned: 0 },
      { id: "week-2", title: "Week 2", isFolder: true, isExpanded: false, s3Key: null, mimeType: null, pinned: 0 },
      { id: "week-1", title: "Week 1", isFolder: true, isExpanded: false, s3Key: null, mimeType: null, pinned: 0 },
      { id: "week-20", title: "Week 20", isFolder: true, isExpanded: false, s3Key: null, mimeType: null, pinned: 0 },
      { id: "reports", title: "Previous Project Reports", isFolder: true, isExpanded: false, s3Key: null, mimeType: null, pinned: 0 },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/tree/children"),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).items.map((item: { title: string }) => item.title)).toEqual([
      "Previous Project Reports",
      "Week 1",
      "Week 2",
      "Week 10",
      "Week 20",
    ]);
  });

  it("reads each child-list request from PostgreSQL", async () => {
    mocks.sql.mockResolvedValue([]);

    await GET(new NextRequest("http://localhost/api/tree/children"));
    await GET(new NextRequest("http://localhost/api/tree/children"));

    // the document-bundle join is a nested fragment, so count the reads
    const childReads = mocks.sql.mock.calls.filter(([strings]) =>
      (strings as string[]).join("").includes("FROM app.tree_items ti"),
    );
    expect(childReads).toHaveLength(2);
  });

  it("marks PDF bundle folders and leaves other rows untouched", async () => {
    mocks.sql.mockResolvedValue([
      { id: "lecture", title: "Lecture 3", isFolder: true, isExpanded: false, s3Key: null, mimeType: null, pinned: 0, bundlePdfId: "pdf-1", bundleNoteId: "md-1" },
      { id: "pending", title: "Lecture 4", isFolder: true, isExpanded: false, s3Key: null, mimeType: null, pinned: 0, bundlePdfId: "pdf-2", bundleNoteId: null },
      { id: "week", title: "Week 1", isFolder: true, isExpanded: false, s3Key: null, mimeType: null, pinned: 0, bundlePdfId: null, bundleNoteId: null },
    ]);

    const response = await GET(new NextRequest("http://localhost/api/tree/children"));
    const items = (await response.json()).items as Array<Record<string, unknown>>;

    expect(items.find((item) => item.id === "lecture")?.bundle).toEqual({ pdfId: "pdf-1", noteId: "md-1" });
    expect(items.find((item) => item.id === "pending")?.bundle).toEqual({ pdfId: "pdf-2", noteId: null });
    expect(items.find((item) => item.id === "week")).not.toHaveProperty("bundle");
  });

  it("rejects a malformed parent before it reaches the uuid cast", async () => {
    await expect(
      GET(new NextRequest("http://localhost/api/tree/children?parent_id=----")),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("rejects a trashed parent before reading its children", async () => {
    mocks.sql.mockResolvedValue([]);

    await expect(
      GET(
        new NextRequest(
          "http://localhost/api/tree/children?parent_id=11111111-1111-1111-1111-111111111111",
        ),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
});
