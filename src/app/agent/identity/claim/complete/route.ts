import { NextRequest } from "next/server";
import {
  createErrorResponse,
  parseJsonBody,
  validateSession,
} from "@/lib/auth";
import { completeOAuthAgentRegistration } from "@/lib/agent-registration";
import { assertTrustedOrigin } from "@/lib/api-error";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import {
  agentRegistrationCompleteSchema,
  validateBody,
} from "@/lib/validations/schemas";

export async function POST(request: NextRequest) {
  assertTrustedOrigin(request);
  const limited = await checkRateLimit(
    "agent-registration-claim",
    getClientIp(request),
  );
  if (limited) return limited;

  const user = await validateSession();
  if (!user) {
    return createErrorResponse("OAuth authentication is required", 401);
  }

  const { data, error } = await parseJsonBody(request);
  if (error) return error;
  const result = validateBody(agentRegistrationCompleteSchema, data);
  if (!result.success) return result.response;

  const claim = await completeOAuthAgentRegistration(
    result.data.claim_token,
    result.data.user_code,
    user.user_id,
    user.email,
    user.session_version,
  );
  if (!claim) {
    return createErrorResponse(
      "The OAuth email does not match this new-user claim, or the claim expired",
      400,
    );
  }

  return Response.json({
    registration_id: claim.id,
    registration_type: "service_auth",
    status: "verified",
  });
}
