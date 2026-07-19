import { NextRequest } from "next/server";
import sql from "@/database/pgsql.js";
import { createErrorResponse, parseJsonBody } from "@/lib/auth";
import { createAgentRegistrationClaim, findOpenAgentRegistrationByEmail } from "@/lib/agent-registration";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import { agentRegistrationSchema, validateBody } from "@/lib/validations/schemas";
import { getBaseUrl } from "@/lib/public/agent-content";

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

  const existingClaim = await findOpenAgentRegistrationByEmail(email);
  if (existingClaim) {
    return createErrorResponse("A registration claim is already pending for this email", 409);
  }

  const { claim, claimToken, userCode } = await createAgentRegistrationClaim(email);
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
