import { NextRequest } from "next/server";
import { createErrorResponse, parseJsonBody } from "@/lib/auth";
import { findAgentRegistrationClaim } from "@/lib/agent-registration";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import { agentRegistrationClaimSchema, validateBody } from "@/lib/validations/schemas";

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit("agent-registration-claim", getClientIp(request));
  if (limited) return limited;

  const { data, error } = await parseJsonBody(request);
  if (error) return error;
  const result = validateBody(agentRegistrationClaimSchema, data);
  if (!result.success) return result.response;

  const claim = await findAgentRegistrationClaim(result.data.claim_token);
  if (!claim || claim.expires_at <= new Date()) {
    return createErrorResponse("Invalid or expired registration claim", 400);
  }

  return Response.json({
    registration_id: claim.id,
    registration_type: "service_auth",
    status: claim.status,
    expires_at: claim.expires_at.toISOString(),
  });
}
