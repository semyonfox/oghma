import { getBaseUrl } from "@/lib/public/agent-content";

export function GET() {
  const baseUrl = getBaseUrl();
  const body = `# OghmaNotes auth.md

OghmaNotes supports **agent-initiated registration for new users only**. An agent may start a registration claim, but the person must choose their own password and verify their email in the OghmaNotes browser flow. This release does not issue agent access tokens or grant access to notes, Canvas, chat, or any private API.

## Start registration

POST \`${baseUrl}/agent/identity\` with JSON:

\`\`\`json
{ "type": "service_auth", "login_hint": "student@example.com" }
\`\`\`

The email must not already belong to an OghmaNotes account. The response contains a short-lived \`claim_token\`, a six-digit \`user_code\`, and a \`verification_uri\`. Give the person the URI and code. Never ask them for a password, session cookie, email verification link, or verification token.

## Claim and completion

The person opens \`verification_uri\`, enters the code, and proves ownership using one of the options shown by OghmaNotes:

- Google or GitHub OAuth with a provider-verified email matching the claim; or
- a password followed by OghmaNotes email-link verification.

The agent never receives the OAuth token, password, session cookie, or email verification link. Poll \`POST ${baseUrl}/agent/identity/claim\` with \`{ "claim_token": "..." }\` to learn whether the claim is pending, registered, or verified. Poll no more than once every five seconds.

## Limits

- Claims expire after 15 minutes.
- Claims are for previously unknown email addresses only.
- Completion creates a normal OghmaNotes account. OAuth email ownership is accepted only from a verified provider response; password registrations require the normal email link.
- A verified claim is proof of completed registration only; it is not an API credential.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Content-Location": `${baseUrl}/auth.md`,
    },
  });
}
