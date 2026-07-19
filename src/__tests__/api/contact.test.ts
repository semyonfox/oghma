import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockSql, mockRateLimit, mockRecordMarketingEvent } = vi.hoisted(() => {
  const sql = vi.fn();
  Object.assign(sql, { json: vi.fn((value) => value) });
  return {
    mockSql: sql,
    mockRateLimit: vi.fn(),
    mockRecordMarketingEvent: vi.fn(),
  };
});

vi.mock("@/database/pgsql.js", () => ({ default: mockSql }));
vi.mock("@/lib/api-error", () => ({
  withErrorHandler:
    (handler: (request: NextRequest) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(request),
}));
vi.mock("@/lib/rateLimiter", () => ({
  checkRateLimit: mockRateLimit,
  getClientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("@/lib/marketing/events", () => ({
  recordMarketingEvent: mockRecordMarketingEvent,
}));
vi.mock("@/lib/logger", () => ({
  default: { warn: vi.fn() },
}));

import { POST } from "@/app/api/contact/route";

const validBody = {
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.com",
  role: "student",
  interest: "beta_access",
  message: "Please add me to the beta.",
  source: "contact",
};

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/contact", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/contact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSql.mockReset();
    mockRateLimit.mockResolvedValue(null);
    mockRecordMarketingEvent.mockResolvedValue(true);
    mockSql.mockResolvedValueOnce([
      { id: "00000000-0000-4000-8000-000000000001" },
    ]);
    mockSql.mockResolvedValueOnce([]);
    process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
    process.env.CLOUDFLARE_EMAIL_API_TOKEN = "test-token";
    process.env.EMAIL_FROM = "noreply@oghmanotes.ie";
    process.env.CONTACT_TO_EMAIL = "owner@example.com";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: true }), { status: 200 }),
        ),
    );
  });

  it("stores the lead before forwarding and records delivery", async () => {
    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      notificationDelivered: true,
    });
    expect(mockSql).toHaveBeenCalledTimes(2);
    expect(mockSql.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(fetch).mock.invocationCallOrder[0],
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/test-account/email/sending/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
    const requestOptions = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(JSON.parse(String(requestOptions?.body))).toEqual(
      expect.objectContaining({
        from: "noreply@oghmanotes.ie",
        to: "owner@example.com",
        reply_to: "ada@example.com",
      }),
    );
    expect(mockRecordMarketingEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "contact_form_success" }),
      expect.any(NextRequest),
      { trusted: false },
    );
  });

  it("keeps a stored submission successful when notification fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false }), { status: 503 }),
    );

    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      notificationDelivered: false,
    });
    expect(mockSql).toHaveBeenCalledTimes(2);
  });

  it("silently discards honeypot submissions", async () => {
    const response = await POST(
      request({ ...validBody, website: "spam.test" }),
    );

    expect(response.status).toBe(200);
    expect(mockSql).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mockRecordMarketingEvent).not.toHaveBeenCalled();
  });

  it("rejects role values outside the public form contract", async () => {
    const response = await POST(request({ ...validBody, role: "spammer" }));

    expect(response.status).toBe(400);
    expect(mockSql).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
