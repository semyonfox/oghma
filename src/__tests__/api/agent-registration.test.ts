import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql.js", () => ({ default: vi.fn() }));
vi.mock("@/lib/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/auth", () => ({
  createErrorResponse: (error: string, status = 400) =>
    Response.json({ success: false, error }, { status }),
  parseJsonBody: async (request: Request) => ({
    data: await request.json(),
    error: null,
  }),
}));
vi.mock("@/lib/agent-registration", () => ({
  createAgentRegistrationClaim: vi.fn(),
  findAgentRegistrationClaim: vi.fn(),
  findOpenAgentRegistrationByEmail: vi.fn(),
}));

import sql from "@/database/pgsql.js";
import {
  createAgentRegistrationClaim,
  findAgentRegistrationClaim,
  findOpenAgentRegistrationByEmail,
} from "@/lib/agent-registration";
import { POST as startRegistration } from "@/app/agent/identity/route";
import { POST as readClaim } from "@/app/agent/identity/claim/route";

const CLAIM_TOKEN = "a".repeat(64);

function request(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sql).mockResolvedValue([]);
  vi.mocked(findOpenAgentRegistrationByEmail).mockResolvedValue(null);
});

describe("auth.md new-user registration", () => {
  it("starts a short-lived service_auth claim for a previously unknown email", async () => {
    const expiresAt = new Date("2026-07-14T12:15:00.000Z");
    vi.mocked(createAgentRegistrationClaim).mockResolvedValue({
      claim: {
        id: "claim-1",
        email: "student@example.com",
        status: "pending",
        expires_at: expiresAt,
        created_user_id: null,
      },
      claimToken: CLAIM_TOKEN,
      userCode: "123456",
    });

    const response = await startRegistration(
      request("https://oghmanotes.ie/agent/identity", {
        type: "service_auth",
        login_hint: "Student@example.com",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      registration_id: "claim-1",
      registration_type: "service_auth",
      claim_token: CLAIM_TOKEN,
      claim: {
        user_code: "123456",
        verification_uri: expect.stringContaining("/register?agent_claim_token="),
      },
    });
    expect(createAgentRegistrationClaim).toHaveBeenCalledWith(
      "student@example.com",
    );
  });

  it("refuses an existing account instead of creating a claim", async () => {
    vi.mocked(sql).mockResolvedValue([{ user_id: "user-1" }]);

    const response = await startRegistration(
      request("https://oghmanotes.ie/agent/identity", {
        type: "service_auth",
        login_hint: "student@example.com",
      }),
    );

    expect(response.status).toBe(409);
    expect(createAgentRegistrationClaim).not.toHaveBeenCalled();
  });

  it("reports verified completion but never issues an API credential", async () => {
    vi.mocked(findAgentRegistrationClaim).mockResolvedValue({
      id: "claim-1",
      email: "student@example.com",
      status: "verified",
      expires_at: new Date("2099-07-14T12:15:00.000Z"),
      created_user_id: "user-1",
    });

    const response = await readClaim(
      request("https://oghmanotes.ie/agent/identity/claim", {
        claim_token: CLAIM_TOKEN,
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("verified");
    expect(body).not.toHaveProperty("access_token");
  });
});
