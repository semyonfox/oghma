import { NextRequest } from "next/server";
import sql from "@/database/pgsql";
import { createErrorResponse, parseJsonBody } from "@/lib/auth/session";
import { createAgentRegistrationClaim, findOpenAgentRegistrationByEmail } from "@/lib/auth/agent-registration";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { agentRegistrationSchema, validateBody } from "@/lib/validations/schemas";
import { getBaseUrl } from "@/lib/public/agent-content";

const PENDING_CLAIM_MESSAGE = "A registration claim is already pending for this email";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit("agent-registration", getClientIp(request));
  if (limited) return limited;

  const { data, error } = await parseJsonBody(request);
  if (error) return error;
  const result = validateBody(agentRegistrationSchema, data);
  if (!result.success) return result.response;

  const email = result.data.login_hint.toLowerCase();
  const [existingUser] = await sql`SELECT user_id FROM app.login WHERE LOWER(email) = ${email} LIMIT 1`;
  if (existingUser) {
    return createErrorResponse("This email already has an OghmaNotes account", 409);
  }

  // an expired claim nobody finished still holds the open-email unique index,
  // which would otherwise turn every later attempt for this address into a 500
  await sql`
    DELETE FROM app.agent_registration_claims
    WHERE LOWER(email) = ${email}
      AND status = 'pending'
      AND expires_at <= NOW()
  `;

  const existingClaim = await findOpenAgentRegistrationByEmail(email);
  if (existingClaim) {
    return createErrorResponse(PENDING_CLAIM_MESSAGE, 409);
  }

  let created: Awaited<ReturnType<typeof createAgentRegistrationClaim>>;
  try {
    created = await createAgentRegistrationClaim(email);
  } catch (error) {
    // a concurrent request for the same email won the unique index
    if (isUniqueViolation(error)) return createErrorResponse(PENDING_CLAIM_MESSAGE, 409);
    throw error;
  }
  const { claim, claimToken, userCode } = created;
  const baseUrl = getBaseUrl();
  return Response.json(
    {
      registration_id: claim.id,
      registration_type: "service_auth",
      claim_token: claimToken,
      claim_token_expires: claim.expires_at.toISOString(),
      claim: {
        user_code: userCode,
        expires_in: 900,
        verification_uri: `${baseUrl}/register?agent_claim_token=${encodeURIComponent(claimToken)}`,
      },
    },
    { status: 201 },
  );
}
