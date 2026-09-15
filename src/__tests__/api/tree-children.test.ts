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

vi.mock("@/lib/api-error", () => ({
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

    expect(mocks.sql).toHaveBeenCalledTimes(2);
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
