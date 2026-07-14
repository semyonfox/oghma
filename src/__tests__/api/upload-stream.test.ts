/**
 * Upload API stream route tests
 *
 * Regression coverage for the PDF "error 500" bug: an attachment row that
 * survived in the DB while its storage object went missing (e.g. orphans
 * from the AWS → homelab/RustFS migration) must return a clean 404 — never
 * an unhandled 500. Storage-backend failures must return 502.
 *
 * Strategy mirrors notes.test.js: mock DB/auth/storage at module level,
 * import the real route handler, call it with synthetic NextRequests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";

vi.mock("@/database/pgsql", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  return { default: sqlMock };
});

vi.mock("@/lib/auth", () => ({
  validateSession: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/queue", () => ({
  enqueueCanvasJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/xray", () => ({
  xraySubsegment: vi.fn((_name: string, fn: () => unknown) => fn()),
}));

vi.mock("@/lib/config", () => ({
  config: { upload: { maxFileSizeBytes: 50 * 1024 * 1024 } },
}));

vi.mock("@/lib/notes/storage/pg-tree.js", () => ({
  addNoteToTree: vi.fn().mockResolvedValue(undefined),
}));

const mockStorage = {
  getObjectStream: vi.fn(),
  hasObject: vi.fn(),
  putObject: vi.fn(),
  deleteObject: vi.fn(),
};

vi.mock("@/lib/storage/init", () => ({
  getStorageProvider: () => mockStorage,
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/upload/route";
import { validateSession } from "@/lib/auth";
import sql from "@/database/pgsql";

const MOCK_USER = {
  user_id: "00000000-0000-0000-0000-0000000000aa",
  email: "test@example.com",
};

// mimics what @aws-sdk/client-s3 throws for a missing object
function noSuchKeyError() {
  const err = new Error("NoSuchKey: The specified key does not exist.");
  err.name = "NoSuchKey";
  (err as { code?: string } & Error).code = "NoSuchKey";
  return err;
}

function makeGet(path: string, stream = true) {
  const url = `http://localhost:3000/api/upload?path=${encodeURIComponent(path)}${stream ? "&stream=1" : ""}`;
  return new NextRequest(url, { method: "GET" });
}

beforeEach(() => {
  vi.clearAllMocks();
  (validateSession as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_USER);
  // attachment row is owned by the user by default
  (sql as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
    { "?column?": 1 },
  ]);
});

describe("GET /api/upload?stream=1", () => {
  it("returns 404 when the attachment row exists but the storage object is missing", async () => {
    mockStorage.hasObject.mockResolvedValue(false);
    mockStorage.getObjectStream.mockRejectedValue(noSuchKeyError());

    const res = await GET(makeGet("notes/some-note/lecture.pdf"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("File not found");
    expect(mockStorage.getObjectStream).not.toHaveBeenCalled();
  });

  it("returns 502 when storage fails mid-stream despite the object existing", async () => {
    mockStorage.hasObject.mockResolvedValue(true);
    mockStorage.getObjectStream.mockRejectedValue(
      new Error("connect ECONNREFUSED"),
    );

    const res = await GET(makeGet("notes/some-note/lecture.pdf"));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe("Failed to read file from storage");
  });

  it("streams the object with its content type when it exists", async () => {
    mockStorage.hasObject.mockResolvedValue(true);
    mockStorage.getObjectStream.mockResolvedValue({
      body: Readable.from([Buffer.from("%PDF-1.4 fake")]),
      contentType: "application/pdf",
      contentLength: 13,
    });

    const res = await GET(makeGet("notes/some-note/lecture.pdf"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Length")).toBe("13");
  });

  it("forces legacy SVG attachments to download instead of rendering them", async () => {
    mockStorage.hasObject.mockResolvedValue(true);
    mockStorage.getObjectStream.mockResolvedValue({
      body: Readable.from([Buffer.from('<svg><script>alert(1)</script></svg>')]),
      contentType: "image/svg+xml",
    });

    const res = await GET(makeGet("notes/some-note/legacy.svg"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Disposition")).toBe("attachment");
    expect(res.headers.get("Content-Security-Policy")).toBe("sandbox");
  });

  it("returns 404 for unowned paths without touching storage", async () => {
    (sql as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(makeGet("notes/other-user/file.pdf"));

    expect(res.status).toBe(404);
    expect(mockStorage.hasObject).not.toHaveBeenCalled();
    expect(mockStorage.getObjectStream).not.toHaveBeenCalled();
  });

  it("returns the stream URL (not a redirect) on the non-stream branch", async () => {
    const res = await GET(makeGet("notes/some-note/lecture.pdf", false));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toContain("stream=1");
    expect(mockStorage.getObjectStream).not.toHaveBeenCalled();
  });
});
