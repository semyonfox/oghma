import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sqlMock,
  requireAuthMock,
  checkRateLimitMock,
  addNoteToTreeMock,
  getStorageProviderMock,
  storageMock,
  generateUUIDMock,
  isValidUUIDMock,
} = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  requireAuthMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  addNoteToTreeMock: vi.fn(),
  getStorageProviderMock: vi.fn(),
  storageMock: {
    copyObject: vi.fn(),
    getObject: vi.fn(),
    putObject: vi.fn(),
  },
  generateUUIDMock: vi.fn(),
  isValidUUIDMock: vi.fn(),
}));

vi.mock("@/database/pgsql.js", () => ({
  default: sqlMock,
}));

vi.mock("@/lib/api-error", () => {
  class ApiError extends Error {
    statusCode: number;

    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  }

  return {
    ApiError,
    withErrorHandler: (handler: unknown) => handler,
    requireAuth: requireAuthMock,
    requireValidId: (value: string) => value,
  };
});

vi.mock("@/lib/rateLimiter", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@/lib/utils/uuid", () => ({
  isValidUUID: isValidUUIDMock,
  generateUUID: generateUUIDMock,
}));

vi.mock("@/lib/notes/storage/pg-tree.js", () => ({
  addNoteToTree: addNoteToTreeMock,
}));

vi.mock("@/lib/storage/init", () => ({
  getStorageProvider: getStorageProviderMock,
}));

vi.mock("@/lib/logger", () => ({
  default: {
    warn: vi.fn(),
  },
}));

import { POST } from "@/app/api/notes/[id]/share/route";

describe("POST /api/notes/[id]/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireAuthMock.mockResolvedValue({
      user_id: "11111111-1111-1111-1111-111111111111",
      email: "source@example.com",
    });
    checkRateLimitMock.mockResolvedValue(null);
    isValidUUIDMock.mockReturnValue(true);
    generateUUIDMock.mockReturnValue("99999999-9999-9999-9999-999999999999");
    addNoteToTreeMock.mockResolvedValue(undefined);

    storageMock.copyObject.mockResolvedValue(undefined);
    storageMock.getObject.mockResolvedValue("ignored");
    storageMock.putObject.mockResolvedValue(undefined);
    getStorageProviderMock.mockReturnValue(storageMock);

    sqlMock
      .mockResolvedValueOnce([
        { user_id: "22222222-2222-2222-2222-222222222222" },
      ])
      .mockResolvedValueOnce([
        {
          note_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          title: "Shared PDF",
          content: null,
          s3_key: "notes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/file.pdf",
          is_folder: false,
        },
      ])
      .mockResolvedValueOnce([
        { note_id: "99999999-9999-9999-9999-999999999999" },
      ]);
  });

  it("copies S3 object using copyObject for binary-safe cloning", async () => {
    const request = new Request(
      "http://localhost/api/notes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/share",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: "22222222-2222-2222-2222-222222222222",
        }),
      },
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }),
    });

    expect(response.status).toBe(201);
    expect(storageMock.copyObject).toHaveBeenCalledWith(
      "notes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/file.pdf",
      "notes/99999999-9999-9999-9999-999999999999/file.pdf",
      {},
    );
    expect(storageMock.getObject).not.toHaveBeenCalled();
    expect(storageMock.putObject).not.toHaveBeenCalled();
  });
});
