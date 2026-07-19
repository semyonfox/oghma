import { getBaseUrl } from "@/lib/public/agent-content";

export function GET() {
  const baseUrl = getBaseUrl();
  const body = `# OghmaNotes auth.md

Start registration for a new user. The user must approve it and prove email ownership. This does not grant the agent account or API access.

## Start registration

\`POST ${baseUrl}/agent/identity\`

\`\`\`json
{ "type": "service_auth", "login_hint": "student@example.com" }
\`\`\`

The email must be new. Response:

\`\`\`json
{
  "claim_token": "…",
  "claim": {
    "user_code": "123456",
    "verification_uri": "${baseUrl}/register?agent_claim_token=…"
  }
}
\`\`\`

Give the user \`claim.verification_uri\` and \`claim.user_code\`. They finish with matching verified Google/GitHub OAuth, or password plus email link.

Poll no more than every five seconds: \`POST ${baseUrl}/agent/identity/claim\` with \`{ "claim_token": "…" }\`.

Claims expire after 15 minutes. Never request or receive the user's password, OAuth token, cookie, or verification link. A verified claim proves registration only; it is not an API credential.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Content-Location": `${baseUrl}/auth.md`,
    },
  });
}
