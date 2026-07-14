import crypto from "crypto";
import sql from "@/database/pgsql.js";
import { generateSecureToken, hashToken } from "@/lib/tokens";

export const AGENT_REGISTRATION_CLAIM_TTL_MS = 15 * 60 * 1000;

export type AgentRegistrationClaim = {
  id: string;
  email: string;
  status: "pending" | "registered" | "verified";
  expires_at: Date;
  created_user_id: string | null;
};

export function generateUserCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function findOpenAgentRegistrationByEmail(email: string) {
  const [claim] = await sql<AgentRegistrationClaim[]>`
    SELECT id, email, status, expires_at, created_user_id
    FROM app.agent_registration_claims
    WHERE LOWER(email) = LOWER(${email})
      AND status IN ('pending', 'registered')
      AND expires_at > NOW()
    LIMIT 1
  `;
  return claim ?? null;
}

export async function createAgentRegistrationClaim(email: string) {
  const claimToken = generateSecureToken();
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + AGENT_REGISTRATION_CLAIM_TTL_MS);
  const [claim] = await sql<AgentRegistrationClaim[]>`
    INSERT INTO app.agent_registration_claims (
      email, claim_token_hash, user_code_hash, expires_at
    ) VALUES (
      ${email}, ${hashToken(claimToken)}, ${hashToken(userCode)}, ${expiresAt}
    )
    RETURNING id, email, status, expires_at, created_user_id
  `;
  return { claim, claimToken, userCode };
}

export async function findAgentRegistrationClaim(claimToken: string) {
  const [claim] = await sql<AgentRegistrationClaim[]>`
    SELECT id, email, status, expires_at, created_user_id
    FROM app.agent_registration_claims
    WHERE claim_token_hash = ${hashToken(claimToken)}
    LIMIT 1
  `;
  return claim ?? null;
}

export async function validateAgentRegistrationForSignup(
  claimToken: string,
  userCode: string,
  email: string,
) {
  const [claim] = await sql<AgentRegistrationClaim[]>`
    SELECT id, email, status, expires_at, created_user_id
    FROM app.agent_registration_claims
    WHERE claim_token_hash = ${hashToken(claimToken)}
      AND user_code_hash = ${hashToken(userCode)}
      AND status = 'pending'
      AND expires_at > NOW()
      AND LOWER(email) = LOWER(${email})
    LIMIT 1
  `;
  return claim ?? null;
}

export async function markAgentRegistrationRegistered(
  claimId: string,
  userId: string,
) {
  await sql`
    UPDATE app.agent_registration_claims
    SET status = 'registered', created_user_id = ${userId}::uuid, registered_at = NOW()
    WHERE id = ${claimId}::uuid AND status = 'pending'
  `;
}

export async function markAgentRegistrationVerified(userId: string) {
  await sql`
    UPDATE app.agent_registration_claims
    SET status = 'verified', verified_at = NOW()
    WHERE created_user_id = ${userId}::uuid
      AND status = 'registered'
      AND expires_at > NOW()
  `;
}
