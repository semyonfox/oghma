import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  persist: vi.fn(),
  rateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/auth/session", () => ({ validateSession: mocks.session }));
vi.mock("@/lib/study-map/import-paper", () => ({
  importExamPaper: mocks.persist,
}));
vi.mock("@/lib/rate-limiter", () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
import { POST } from "@/app/api/study-maps/[id]/papers/import/route";
const userId = "11111111-1111-4111-8111-111111111111";
const mapId = "22222222-2222-4222-8222-222222222222";
const input = {
  format: "oghma-exam-paper",
  version: 1,
  filename: "2025_2026_CT318_1_1_5.pdf",
  title: "HCI",
  moduleCode: "CT318",
  academicYear: "2025/2026",
  sitting: 1,
  period: 5,
  sha256: "a".repeat(64),
  pdfBase64: Buffer.from("%PDF-fixture").toString("base64"),
  text: "[Page 1]\nQuestion 1",
  warnings: [],
};
function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(
    `http://localhost/api/study-maps/${mapId}/papers/import`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
  );
}
const context = () => ({ params: Promise.resolve({ id: mapId }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user_id: userId });
  mocks.persist.mockResolvedValue({
    noteId: mapId,
    textNoteId: userId,
    duplicate: false,
    indexing: "queued",
  });
});
describe("POST study map paper import", () => {
  it("passes the authenticated owner and chosen module with validated data", async () => {
    expect((await POST(request(input), context())).status).toBe(200);
    expect(mocks.persist).toHaveBeenCalledExactlyOnceWith(userId, mapId, input);
  });
  it("rejects unauthenticated imports before persistence", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(request(input), context())).status).toBe(401);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it("rejects inconsistent module metadata and unexpected fields", async () => {
    expect(
      (await POST(request({ ...input, moduleCode: "CT319" }), context()))
        .status,
    ).toBe(400);
    expect(
      (await POST(request({ ...input, token: "unwanted" }), context())).status,
    ).toBe(400);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it("bounds the request body and rejects the wrong content type", async () => {
    expect(
      (
        await POST(
          request(input, { "content-length": String(47 * 1024 * 1024) }),
          context(),
        )
      ).status,
    ).toBe(413);
    expect(
      (await POST(request(input, { "content-type": "text/html" }), context()))
        .status,
    ).toBe(415);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});
