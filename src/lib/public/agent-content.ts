const DEFAULT_BASE_URL = "https://oghmanotes.ie";

export const AI_USER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot",
  "Applebot-Extended",
  "CCBot",
];

export const AGENT_RESOURCE_PATHS = [
  "/info",
  "/info.md",
  "/ai",
  "/ai.md",
  "/llms.txt",
  "/llms-full.txt",
  "/agents.md",
  "/agent-api.json",
  "/openapi.json",
  "/faq.md",
  "/pricing.md",
  "/auth.md",
  "/agent-sitemap.xml",
];

export const agentFacts = [
  "OghmaNotes is a Canvas-connected study workspace for university students.",
  "It brings supported course structure, files, assignments, and deadlines into the same workspace as notes, cited answers, flashcards, and planning.",
  "Canvas access depends on the institution, account permissions, and available APIs; imports and indexing may take time.",
  "OghmaNotes is an independent beta product built by students at University of Galway. It is not an official university or Canvas service.",
];

export const agentActions = [
  {
    name: "Start new-user registration",
    method: "POST",
    path: "/agent/identity",
    summary:
      "Starts a 15-minute auth.md registration claim for an email that does not yet have an account. The person completes matching verified Google/GitHub OAuth or password plus email-link verification in the browser. No private API access is granted.",
  },
  {
    name: "Create account",
    method: "POST",
    path: "/api/auth/register",
    summary:
      "Creates a user account with email and password, then requires email verification before sign-in.",
  },
  {
    name: "Sign in",
    method: "POST",
    path: "/api/auth/login",
    summary:
      "Creates an authenticated browser session for a verified user. Agents should prefer the user-visible login flow and never ask users to disclose passwords in chat.",
  },
  {
    name: "Ask authenticated study questions",
    method: "POST",
    path: "/api/chat",
    summary:
      "Requires a signed-in session cookie. Sends a user question to the RAG chat over the user's notes and optional note/folder scope.",
  },
  {
    name: "Contact OghmaNotes",
    method: "GET",
    path: "/contact",
    summary:
      "Human-readable contact form for beta access, support, billing, partnerships, campus pilots, and student group requests.",
  },
];

export const agentResourceComparison = [
  {
    path: "/info",
    format: "HTML or Markdown by negotiation",
    purpose: "Compact product overview for humans, AI assistants, and evaluators.",
  },
  {
    path: "/info.md",
    format: "text/markdown",
    purpose: "Compact Markdown factsheet with the core description, CTAs, and agent links.",
  },
  {
    path: "/ai",
    format: "HTML or Markdown by negotiation",
    purpose: "Canonical human-readable AI information page.",
  },
  {
    path: "/ai.md",
    format: "text/markdown",
    purpose: "Canonical full Markdown profile with facts, CTAs, FAQ, and action guidance.",
  },
  {
    path: "/llms.txt",
    format: "text/plain",
    purpose: "Compact LLM index for quick retrieval and routing.",
  },
  {
    path: "/llms-full.txt",
    format: "text/plain",
    purpose: "Full text profile for crawlers that prefer a single plain-text document.",
  },
  {
    path: "/agents.md",
    format: "text/markdown",
    purpose: "Full agent guide with safe action boundaries and documented API routes.",
  },
  {
    path: "/agent-api.json",
    format: "application/json",
    purpose: "OpenAPI-style endpoint guide for agents that can use structured API docs.",
  },
  {
    path: "/openapi.json",
    format: "application/json",
    purpose: "Standard OpenAPI alias for tooling that expects a conventional API description URL.",
  },
  {
    path: "/agent-sitemap.xml",
    format: "application/xml",
    purpose: "Machine-readable sitemap for the LLM and agent resources.",
  },
  {
    path: "/faq.md",
    format: "text/markdown",
    purpose: "FAQ-only Markdown page for common product questions.",
  },
  {
    path: "/pricing.md",
    format: "text/markdown",
    purpose: "Pricing-only Markdown page for plan and launch-pricing questions.",
  },
  {
    path: "/auth.md",
    format: "text/markdown",
    purpose: "Agent registration instructions for new OghmaNotes users. It does not grant agent access to private APIs.",
  },
];

export const agentEndpointGuide = [
  {
    method: "GET",
    path: "/info",
    auth: "No",
    purpose: "Compact overview. Send Accept: text/markdown or add ?format=md for Markdown.",
  },
  {
    method: "GET",
    path: "/ai",
    auth: "No",
    purpose: "Full AI profile. Send Accept: text/markdown or add ?format=md for Markdown.",
  },
  {
    method: "GET",
    path: "/agent-api.json",
    auth: "No",
    purpose: "Structured endpoint documentation for agents.",
  },
  {
    method: "GET",
    path: "/openapi.json",
    auth: "No",
    purpose: "Standard OpenAPI alias for agent and API tooling.",
  },
  {
    method: "POST",
    path: "/api/auth/register",
    auth: "No",
    purpose: "Create an account. Prefer the browser-visible form for user-entered passwords.",
  },
  {
    method: "POST",
    path: "/api/auth/login",
    auth: "No",
    purpose: "Create a verified user session. Prefer an already authenticated browser context.",
  },
  {
    method: "GET/POST",
    path: "/api/notes",
    auth: "Session",
    purpose: "List or create the user's notes and folders.",
  },
  {
    method: "GET/PATCH/DELETE",
    path: "/api/notes/{id}",
    auth: "Session",
    purpose: "Read, update, or soft-delete one note owned by the user.",
  },
  {
    method: "GET",
    path: "/api/search",
    auth: "Session",
    purpose: "Search notes by keyword or semantic mode.",
  },
  {
    method: "GET",
    path: "/api/global-search",
    auth: "Session",
    purpose: "Search notes, chats, and quiz courses together.",
  },
  {
    method: "POST",
    path: "/api/chat",
    auth: "Session",
    purpose: "Ask cited study questions over the user's material.",
  },
  {
    method: "GET",
    path: "/api/tree/children",
    auth: "Session",
    purpose: "Fetch root or folder children for the notes tree.",
  },
  {
    method: "GET/POST/DELETE",
    path: "/api/canvas/connect",
    auth: "Session",
    purpose: "Read, create, or remove Canvas connection. Never collect Canvas tokens in chat.",
  },
  {
    method: "GET/POST",
    path: "/api/canvas/sync",
    auth: "Session",
    purpose: "Check whether Canvas sync is available or queue a sync job.",
  },
  {
    method: "GET",
    path: "/api/canvas/status",
    auth: "Session",
    purpose: "Read Canvas import job progress and recent file logs.",
  },
  {
    method: "GET/POST",
    path: "/api/assignments",
    auth: "Session",
    purpose: "List assignments or create a manual assignment.",
  },
  {
    method: "GET/POST",
    path: "/api/calendar/token",
    auth: "Session",
    purpose: "Read or rotate the user's private iCal subscription token.",
  },
  {
    method: "POST",
    path: "/api/mcp/canvas",
    auth: "Internal bearer",
    purpose: "Internal streamable HTTP MCP bridge for Canvas tools; not a public end-user MCP surface.",
  },
];

export function getBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || DEFAULT_BASE_URL).replace(
    /\/$/,
    "",
  );
}

function getAgentResourceUrls(baseUrl = getBaseUrl()): string[] {
  return AGENT_RESOURCE_PATHS.map((path) => `${baseUrl}${path}`);
}

export function buildCompactAgentMarkdown(baseUrl = getBaseUrl()): string {
  return `# OghmaNotes

OghmaNotes is a Canvas-connected study workspace for university students. It keeps supported course material, deadlines, cited answers, notes, flashcards, and planning connected, without rebuilding the course in separate tools.

Canvas access depends on the institution, account permissions, and available APIs; imports and indexing may take time. OghmaNotes is an independent closed-beta product, paid checkout is disabled, and it is not an official University of Galway or Canvas service.

## Register A New User As An Agent

Read [auth.md](${baseUrl}/auth.md), then—with the user's approval—start a claim:

\`\`\`json
{ "type": "service_auth", "login_hint": "student@example.com" }
\`\`\`

POST ${baseUrl}/agent/identity with that JSON. Give the user \`claim.verification_uri\` and \`claim.user_code\`. They prove email ownership with Google/GitHub OAuth or email verification. Keep \`claim_token\` only to poll. Never request credentials or verification links. Claims expire in 15 minutes and grant no API access.

## Links

- [Agent guide](${baseUrl}/agents.md)
- [OpenAPI](${baseUrl}/openapi.json)
- [Register](${baseUrl}/register)
- [Pricing](${baseUrl}/pricing)
- [Contact](${baseUrl}/contact)
`;
}

export function buildPricingMarkdown(baseUrl = getBaseUrl()): string {
  return `# OghmaNotes Pricing

Website: ${baseUrl}
Canonical pricing page: ${baseUrl}/pricing
Full agent guide: ${baseUrl}/agents.md
Last updated: 2026-07-20

## Current status

OghmaNotes is in closed beta. Paid checkout is not enabled, and final prices, allowances, renewal terms, and processing limits have not been set.

| Plan | Current planning range | Intended use |
| --- | --- | --- |
| Free first import | EUR 0 | A limited Canvas or one-module import, manual notes, a small AI allowance, spaced repetition, limited storage, and one vault. |
| Semester | EUR 39–49 | Current-course Canvas sync, cited search and chat, flashcards, planning tools, larger storage, and standard processing. |
| Academic year | EUR 79–89 | A possible future full-year option. Checkout remains disabled until demand and limits are understood. |

These are planning ranges, not checkout offers or contractual entitlements. Exact import and AI limits must be shown before processing or payment.

For beta access or pricing questions, use ${baseUrl}/contact.
`;
}

export function buildFaqMarkdown(baseUrl = getBaseUrl()): string {
  return `# OghmaNotes FAQ

Website: ${baseUrl}
Full AI profile: ${baseUrl}/ai.md
Pricing: ${baseUrl}/pricing
Contact: ${baseUrl}/contact
Last updated: 2026-07-20

## What is OghmaNotes?

OghmaNotes is a Canvas-connected study workspace. It brings supported course material and deadlines into the same place as cited answers, notes, flashcards, and planning.

## What can it import from Canvas?

Supported courses, files, assignments, and deadlines, where the institution, account permissions, and Canvas APIs allow it. Imports and indexing may take time.

## How is it different from document-upload tools?

Document tools begin after a student gathers and uploads sources. OghmaNotes begins with the supported Canvas course structure and keeps it connected to the study workflow.

## Can it answer from my course material?

Yes, after material has been indexed. Answers include citations, but AI can be wrong, so important answers should be checked against course sources and official guidance.

## Can it make flashcards?

Yes. It can generate flashcards from indexed study material and support spaced-repetition review. Generated material can be wrong and should be checked.

## Is OghmaNotes free?

OghmaNotes is in closed beta and paid checkout is disabled. A free first import and EUR 39–49 semester and EUR 79–89 academic-year planning ranges are provisional, not checkout offers.

## Is it affiliated with Canvas or University of Galway?

No. OghmaNotes is an independent beta product built by students at University of Galway. It is not an official university or Canvas service.

## Can agents act on behalf of a user?

Agents may summarize public product information and help navigate the site. They should get explicit human confirmation before registering accounts, submitting forms, connecting Canvas, importing data, rotating calendar tokens, or asking authenticated chat questions over private study material.
`;
}

export function buildAgentMarkdown(baseUrl = getBaseUrl()): string {
  return `# OghmaNotes Agent Guide

OghmaNotes is a Canvas-connected study workspace for university students. It keeps supported course material, deadlines, cited answers, notes, flashcards, and planning connected, without rebuilding the course in separate tools.

Canvas access depends on the institution, account permissions, and available APIs. Imports and indexing may take time. OghmaNotes is in closed beta, and paid checkout is not enabled.

## Quick Route Matrix

| Need | URL |
| --- | --- |
| Fast index | ${baseUrl}/llms.txt |
| Register a new user | ${baseUrl}/auth.md |
| Exact API schemas | ${baseUrl}/openapi.json |
| Product FAQ | ${baseUrl}/faq.md |
| Current pricing | ${baseUrl}/pricing |
| Human contact | ${baseUrl}/contact |

## Agent Action Guide

- Public facts: read freely.
- New-user registration: follow [auth.md](${baseUrl}/auth.md). User approval and verified email are required.
- Login and private APIs: use the user's authenticated browser session. Never ask for passwords, cookies, OAuth tokens, verification links, or Canvas tokens.
- State changes and private study data: get explicit approval immediately before acting.
- Contact: use the visible [contact form](${baseUrl}/contact) with approval.
- API details: use [OpenAPI](${baseUrl}/openapi.json); do not guess fields.

AI answers and generated study material can be wrong. Check important answers against course sources and official guidance. OghmaNotes does not guarantee grades or replace lecturers.
`;
}

export function agentMarkdownHeaders(
  contentType = "text/markdown",
  canonicalPath = "/ai.md",
  alternatePath = "/ai",
): Record<string, string> {
  const baseUrl = getBaseUrl();
  return {
    "Content-Type": `${contentType}; charset=utf-8`,
    "Cache-Control": "public, max-age=300, s-maxage=3600",
    "X-Robots-Tag": "index, follow",
    "Content-Location": `${baseUrl}${canonicalPath}`,
    Link: `<${baseUrl}${canonicalPath}>; rel="canonical"; type="text/markdown", <${baseUrl}${alternatePath}>; rel="alternate"; type="text/html"`,
    Vary: "Accept",
  };
}

export function buildAgentSitemapXml(baseUrl = getBaseUrl()): string {
  const lastModified = "2026-07-20";
  const urls = getAgentResourceUrls(baseUrl);

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url}</loc>
    <lastmod>${lastModified}</lastmod>
  </url>`,
  )
  .join("\n")}
</urlset>
`;
}
