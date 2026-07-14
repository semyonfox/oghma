import { getBaseUrl } from "@/lib/public/agent-content";

export function GET() {
  const baseUrl = getBaseUrl();
  return Response.json(
    {
      issuer: baseUrl,
      resource: baseUrl,
      authorization_servers: [baseUrl],
      grant_types_supported: [],
      agent_auth: {
        skill: `${baseUrl}/auth.md`,
        identity_endpoint: `${baseUrl}/agent/identity`,
        claim_endpoint: `${baseUrl}/agent/identity/claim`,
        identity_types_supported: ["service_auth"],
        registration_scope: "new_user_only",
        credentials_issued: false,
      },
    },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
}
