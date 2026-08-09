import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  requireAuth: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/lib/api-error", () => ({
  requireAuth: mocks.requireAuth,
  withErrorHandler:
    (handler: (...args: any[]) => Promise<Response>) =>
    async (...args: any[]) => handler(...args),
  ApiError: class extends Error {
    constructor(
      public statusCode: number,
      public userMessage: string,
    ) {
      super(userMessage);
    }
  },
}));

vi.mock("@/lib/cache", () => ({
  cacheGet: mocks.cacheGet,
  cacheSet: mocks.cacheSet,
  cacheKeys: {
    treeChildren: vi.fn(() => "tree-children"),
  },
}));

vi.mock("@/database/pgsql.js", () => ({ default: mocks.sql }));

import { GET } from "@/app/api/tree/children/route";

describe("GET /api/tree/children", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheGet.mockResolvedValue(null);
    mocks.cacheSet.mockResolvedValue(undefined);
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

  it("naturally sorts results from an existing cache entry", async () => {
    mocks.cacheGet.mockResolvedValue({
      parentId: "root",
      items: [
        { id: "week-10", title: "Week 10" },
        { id: "week-2", title: "Week 2" },
        { id: "week-1", title: "Week 1" },
      ],
    });

    const response = await GET(
      new NextRequest("http://localhost/api/tree/children"),
    );

    expect((await response.json()).items.map((item: { title: string }) => item.title)).toEqual([
      "Week 1",
      "Week 2",
      "Week 10",
    ]);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
