import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { sqlMock, beginMock, storage, objects } = vi.hoisted(() => {
  const objects = new Map<string, Buffer>();
  const sqlMock = vi.fn(
    async (_strings: TemplateStringsArray, ..._values: unknown[]): Promise<Record<string, unknown>[]> => [{ exists: 1 }],
  );
  const beginMock = vi.fn(
    async (callback: (tx: typeof sqlMock) => Promise<unknown>) => callback(sqlMock),
  );
  const storage = {
    putObject: vi.fn(async (path: string, buffer: Buffer) => {
      objects.set(path, Buffer.from(buffer));
    }),
    deleteObject: vi.fn(async (path: string) => {
      objects.delete(path);
    }),
  };
  return { sqlMock, beginMock, storage, objects };
});

vi.mock("@/database/pgsql", () => ({
  default: Object.assign(sqlMock, { begin: beginMock }),
}));
vi.mock("@/lib/auth", () => ({
  validateSession: vi.fn(async () => ({
    user_id: "00000000-0000-0000-0000-0000000000aa",
    email: "reader@example.com",
  })),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/rateLimiter", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/queue", () => ({ enqueueCanvasJob: vi.fn(async () => undefined) }));
vi.mock("@/lib/xray", () => ({
  xraySubsegment: vi.fn((_name: string, fn: () => unknown) => fn()),
}));
vi.mock("@/lib/config", () => ({
  config: { upload: { maxFileSizeBytes: 50 * 1024 * 1024 } },
}));
vi.mock("@/lib/notes/storage/create-note", () => ({
  createNoteWithTree: vi.fn(),
  removeNewNoteWithTree: vi.fn(),
}));
vi.mock("@/lib/notes/tree-cache", () => ({
  invalidateTreeAfterPublish: vi.fn(),
}));
vi.mock("@/lib/storage/init", () => ({ getStorageProvider: () => storage }));

import { POST } from "@/app/api/upload/route";

const noteId = "00000000-0000-0000-0000-000000000001";

function upload(content: string) {
  const form = new FormData();
  form.append("noteId", noteId);
  form.append("file", new File([content], "essay.txt", { type: "text/plain" }));
  return new NextRequest("http://localhost/api/upload", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/upload object identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    objects.clear();
    sqlMock.mockReset();
    sqlMock.mockResolvedValue([{ exists: 1 }]);
    beginMock.mockReset();
    beginMock.mockImplementation(async (callback) => callback(sqlMock));
  });

  it("keeps both objects when the same filename is uploaded twice to one note", async () => {
    const first = await POST(upload("first"));
    const second = await POST(upload("second"));
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody.fileName).toBe("essay.txt");
    expect(secondBody.fileName).toBe("essay.txt");
    expect(firstBody.path).toBe(`notes/${noteId}/${firstBody.attachmentId}/essay.txt`);
    expect(secondBody.path).toBe(`notes/${noteId}/${secondBody.attachmentId}/essay.txt`);
    expect(firstBody.path).not.toBe(secondBody.path);
    expect(objects.get(firstBody.path)?.toString()).toBe("first");
    expect(objects.get(secondBody.path)?.toString()).toBe("second");
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it("deletes only the failed attempt's object when metadata insert fails", async () => {
    const first = await POST(upload("original"));
    const firstBody = await first.json();
    beginMock.mockRejectedValueOnce(new Error("attachment insert failed"));

    const second = await POST(upload("replacement"));
    const secondKey = storage.putObject.mock.calls[1]?.[0];

    expect(first.status).toBe(200);
    expect(second.status).toBe(500);
    if (!secondKey) throw new Error("Second upload did not write an object");
    expect(secondKey).not.toBe(firstBody.path);
    expect(storage.deleteObject).toHaveBeenCalledExactlyOnceWith(secondKey);
    expect(objects.get(firstBody.path)?.toString()).toBe("original");
    expect(objects.has(secondKey)).toBe(false);
  });
});
