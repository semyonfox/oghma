import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { NextRequest } from "next/server";
import { requireE2EDatabaseUrl } from "../helpers/env";

const mocks = vi.hoisted(() => ({
  createAuthSession: vi.fn(
    async (user: { user_id: string; email: string }) =>
      Response.json({ success: true, user }),
  ),
  recordActivationMilestone: vi.fn(async () => true),
}));

vi.mock("@/lib/auth", () => {
  const createErrorResponse = (
    message: string,
    status = 400,
    additionalData: Record<string, unknown> = {},
  ) => Response.json(
    { success: false, error: message, ...additionalData },
    { status },
  );

  return {
    createAuthSession: mocks.createAuthSession,
    createErrorResponse,
    parseJsonBody: async (request: Request) => {
      if (!request.headers.get("content-type")?.includes("application/json")) {
        return {
          data: null,
          error: createErrorResponse(
            "Content-Type must be application/json",
            415,
          ),
        };
      }
      try {
        const value: unknown = await request.json();
        return {
          data:
            value && typeof value === "object" && !Array.isArray(value)
              ? value
              : null,
          error: null,
        };
      } catch {
        return {
          data: null,
          error: createErrorResponse("Invalid JSON in request body", 400),
        };
      }
    },
  };
});
vi.mock("@/lib/api-error", () => ({ assertTrustedOrigin: vi.fn() }));
vi.mock("@/lib/rateLimiter", () => ({
  checkRateLimit: vi.fn(async () => null),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/marketing/events", () => ({
  recordActivationMilestone: mocks.recordActivationMilestone,
}));

import appSql from "@/database/pgsql";
import { POST as verifyEmail } from "@/app/api/auth/verify-email/route";
import { POST as resetPassword } from "@/app/api/auth/password-reset/verify/route";
import { hashToken } from "@/lib/tokens";

const fixtureSql = postgres(requireE2EDatabaseUrl(), { max: 4 });
let userId: string;
const rollbackConstraint = "agent_registration_claims_e2e_rollback";

function jsonRequest(path: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  userId = randomUUID();
  vi.clearAllMocks();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fixtureSql`
    DELETE FROM app.agent_registration_claims
    WHERE created_user_id = ${userId}::uuid
  `;
  await fixtureSql`DELETE FROM app.login WHERE user_id = ${userId}::uuid`;
});

afterAll(async () => {
  await Promise.all([fixtureSql.end(), appSql.end()]);
});

describe("single-use authentication tokens", () => {
  it("lets exactly one concurrent email-verification request consume a token", async () => {
    const email = `verify-${userId}@example.test`;
    const token = `verify-${randomUUID()}`;
    await fixtureSql`
      INSERT INTO app.login
        (user_id, email, hashed_password, email_verified, is_active,
         verification_token, verification_token_expires)
      VALUES
        (${userId}::uuid, ${email}, 'unused', false, true,
         ${hashToken(token)}, NOW() + INTERVAL '1 hour')
    `;
    await fixtureSql`
      INSERT INTO app.agent_registration_claims
        (email, claim_token_hash, user_code_hash, status, created_user_id,
         expires_at, registered_at)
      VALUES
        (${email}, ${hashToken(`claim-${userId}`)}, ${hashToken("123456")},
         'registered', ${userId}::uuid, NOW() + INTERVAL '1 hour', NOW())
    `;

    const responses = await Promise.all([
      verifyEmail(jsonRequest("/api/auth/verify-email", { token })),
      verifyEmail(jsonRequest("/api/auth/verify-email", { token })),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 400]);
    expect(mocks.createAuthSession).toHaveBeenCalledOnce();
    expect(mocks.recordActivationMilestone).toHaveBeenCalledOnce();

    const [account] = await fixtureSql`
      SELECT email_verified, verification_token
      FROM app.login
      WHERE user_id = ${userId}::uuid
    `;
    expect(account).toMatchObject({
      email_verified: true,
      verification_token: null,
    });

    const [claim] = await fixtureSql`
      SELECT status, verified_at
      FROM app.agent_registration_claims
      WHERE created_user_id = ${userId}::uuid
    `;
    expect(claim.status).toBe("verified");
    expect(claim.verified_at).toBeInstanceOf(Date);
  });

  it("rolls token consumption back when the claim update fails", async () => {
    const email = `rollback-${userId}@example.test`;
    const token = `verify-${randomUUID()}`;
    const tokenHash = hashToken(token);
    await fixtureSql`
      INSERT INTO app.login
        (user_id, email, hashed_password, email_verified, is_active,
         verification_token, verification_token_expires)
      VALUES
        (${userId}::uuid, ${email}, 'unused', false, true,
         ${tokenHash}, NOW() + INTERVAL '1 hour')
    `;
    await fixtureSql`
      INSERT INTO app.agent_registration_claims
        (email, claim_token_hash, user_code_hash, status, created_user_id,
         expires_at, registered_at)
      VALUES
        (${email}, ${hashToken(`claim-${userId}`)}, ${hashToken("123456")},
         'registered', ${userId}::uuid, NOW() + INTERVAL '1 hour', NOW())
    `;

    await fixtureSql.unsafe(
      `ALTER TABLE app.agent_registration_claims DROP CONSTRAINT IF EXISTS ${rollbackConstraint}`,
    );
    await fixtureSql.unsafe(`
      ALTER TABLE app.agent_registration_claims
      ADD CONSTRAINT ${rollbackConstraint}
      CHECK (status <> 'verified' OR email NOT LIKE 'rollback-%@example.test')
      NOT VALID
    `);

    try {
      const failed = await verifyEmail(
        jsonRequest("/api/auth/verify-email", { token }),
      );
      expect(failed.status).toBe(500);
      expect(mocks.createAuthSession).not.toHaveBeenCalled();

      const [account] = await fixtureSql`
        SELECT email_verified, verification_token
        FROM app.login
        WHERE user_id = ${userId}::uuid
      `;
      expect(account).toMatchObject({
        email_verified: false,
        verification_token: tokenHash,
      });
    } finally {
      await fixtureSql.unsafe(
        `ALTER TABLE app.agent_registration_claims DROP CONSTRAINT IF EXISTS ${rollbackConstraint}`,
      );
    }

    const retry = await verifyEmail(
      jsonRequest("/api/auth/verify-email", { token }),
    );
    expect(retry.status).toBe(200);
  });

  it("lets exactly one concurrent password-reset request choose the new password", async () => {
    const email = `reset-${userId}@example.test`;
    const token = `reset-${randomUUID()}`;
    await fixtureSql`
      INSERT INTO app.login
        (user_id, email, hashed_password, email_verified, is_active,
         reset_token, reset_token_expires)
      VALUES
        (${userId}::uuid, ${email}, 'unused', true, true,
         ${hashToken(token)}, NOW() + INTERVAL '1 hour')
    `;

    const passwords = ["FirstPass1", "SecondPass2"] as const;
    const hashPassword = vi.spyOn(bcrypt, "hash");
    const responses = await Promise.all(
      passwords.map((password) =>
        resetPassword(
          jsonRequest("/api/auth/password-reset/verify", { token, password }),
        ),
      ),
    );

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 400]);
    expect(hashPassword).toHaveBeenCalledOnce();

    const [account] = await fixtureSql`
      SELECT hashed_password, reset_token
      FROM app.login
      WHERE user_id = ${userId}::uuid
    `;
    expect(account.reset_token).toBeNull();
    const matches = await Promise.all(
      passwords.map((password) => bcrypt.compare(password, account.hashed_password)),
    );
    expect(matches.filter(Boolean)).toHaveLength(1);
  });

  it("rejects an invalid reset token without hashing a password", async () => {
    const hashPassword = vi.spyOn(bcrypt, "hash");

    const response = await resetPassword(
      jsonRequest("/api/auth/password-reset/verify", {
        token: `missing-${randomUUID()}`,
        password: "UnusedPass1",
      }),
    );

    expect(response.status).toBe(400);
    expect(hashPassword).not.toHaveBeenCalled();
  });
});
