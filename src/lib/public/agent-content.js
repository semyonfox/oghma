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

export function getBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || DEFAULT_BASE_URL).replace(
    /\/$/,
    "",
  );
}

export function getAgentResourceUrls(baseUrl = getBaseUrl()) {
  return AGENT_RESOURCE_PATHS.map((path) => `${baseUrl}${path}`);
}

export function buildCompactAgentMarkdown(baseUrl = getBaseUrl()) {
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

export function buildPricingMarkdown(baseUrl = getBaseUrl()) {
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

export function buildFaqMarkdown(baseUrl = getBaseUrl()) {
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

export function buildAgentMarkdown(baseUrl = getBaseUrl()) {
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

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
]);

const SENSITIVE_OPERATIONS = new Set([
  "post /api/auth/register",
  "post /agent/identity",
  "post /api/notes",
  "patch /api/notes/{id}",
  "delete /api/notes/{id}",
  "post /api/chat",
  "post /api/canvas/connect",
  "delete /api/canvas/connect",
  "post /api/canvas/sync",
  "post /api/assignments",
  "post /api/calendar/token",
]);

const PRIVATE_DATA_OPERATIONS = new Set([
  "get /api/notes",
  "post /api/notes",
  "get /api/notes/{id}",
  "patch /api/notes/{id}",
  "delete /api/notes/{id}",
  "get /api/search",
  "get /api/global-search",
  "post /api/chat",
  "get /api/tree/children",
  "get /api/canvas/connect",
  "post /api/canvas/connect",
  "delete /api/canvas/connect",
  "get /api/canvas/sync",
  "post /api/canvas/sync",
  "get /api/canvas/status",
  "get /api/assignments",
  "post /api/assignments",
  "get /api/calendar/token",
  "post /api/calendar/token",
  "post /api/mcp/canvas",
]);

const TAG_BY_PREFIX = [
  ["/agent/identity", "Auth"],
  ["/api/auth", "Auth"],
  ["/api/notes", "Notes"],
  ["/api/search", "Search"],
  ["/api/global-search", "Search"],
  ["/api/chat", "Chat"],
  ["/api/tree", "Notes"],
  ["/api/canvas", "Canvas"],
  ["/api/assignments", "Assignments"],
  ["/api/calendar", "Calendar"],
  ["/api/mcp", "MCP"],
  ["/contact", "Contact"],
];

function wordsFromPath(path) {
  return path
    .replace(/[{}]/g, "")
    .split(/[/.:-]+/)
    .filter(Boolean)
    .filter((part) => part !== "api")
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ""));
}

function toOperationId(method, path) {
  const parts = wordsFromPath(path);
  return [
    method,
    ...parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)),
  ].join("");
}

function inferTags(path) {
  const match = TAG_BY_PREFIX.find(([prefix]) => path.startsWith(prefix));
  return [match?.[1] ?? "Discovery"];
}

function isSessionOperation(path) {
  return (
    path.startsWith("/api/") &&
    !path.startsWith("/api/auth/") &&
    path !== "/api/mcp/canvas"
  );
}

function decorateAgentOpenApiDocument(document) {
  document.tags = [
    {
      name: "Discovery",
      description: "Public discovery and AI-readable resources.",
    },
    {
      name: "Auth",
      description: "Account creation and browser-session authentication.",
    },
    { name: "Notes", description: "Authenticated note and tree operations." },
    {
      name: "Search",
      description: "Authenticated keyword, semantic, and global search.",
    },
    {
      name: "Chat",
      description: "Authenticated cited study chat over private material.",
    },
    {
      name: "Canvas",
      description:
        "Authenticated Canvas connection, sync, and import status.",
    },
    {
      name: "Assignments",
      description: "Authenticated coursework and manual assignment operations.",
    },
    {
      name: "Calendar",
      description:
        "Authenticated private iCal subscription token operations.",
    },
    { name: "MCP", description: "Internal MCP bridge endpoints." },
    { name: "Contact", description: "Public contact routes." },
  ];
  document.components = {
    ...(document.components ?? {}),
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "session",
        description:
          "Authenticated browser session cookie. Auth.js session cookies may also be accepted by the app.",
      },
      internalMcpBearer: {
        type: "http",
        scheme: "bearer",
        description:
          "Internal bearer token minted by OghmaNotes for the Canvas MCP bridge.",
      },
    },
  };

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue;

      const key = `${method} ${path}`;
      operation.operationId ??= toOperationId(method, path);
      operation.tags ??= inferTags(path);
      operation["x-agent-guidance"] ??=
        "Prefer the browser-visible UI for credentials. Ask for explicit human confirmation before sensitive writes or private-data actions.";

      if (isSessionOperation(path)) {
        operation.security ??= [{ sessionCookie: [] }];
      }
      if (path === "/api/mcp/canvas") {
        operation.security ??= [{ internalMcpBearer: [] }];
        operation["x-internal-only"] = true;
      }
      if (SENSITIVE_OPERATIONS.has(key)) {
        operation["x-human-confirmation-required"] = true;
      }
      if (PRIVATE_DATA_OPERATIONS.has(key)) {
        operation["x-private-data"] = true;
      }
    }
  }

  return document;
}

export function buildAgentOpenApiJson(baseUrl = getBaseUrl()) {
  const document = {
    openapi: "3.1.0",
    info: {
      title: "OghmaNotes Agent Action Guide",
      version: "2026-07-20",
      summary:
        "Structured public and authenticated action contracts for agents helping humans use OghmaNotes.",
      description:
        "Agents must obtain explicit human confirmation before registering accounts, submitting contact forms, sending messages, importing data, or querying authenticated study material.",
      contact: {
        email: "contact@oghmanotes.ie",
        url: `${baseUrl}/contact`,
      },
    },
    servers: [{ url: baseUrl }],
    externalDocs: {
      description: "Canonical Markdown agent profile",
      url: `${baseUrl}/ai.md`,
    },
    paths: {
      "/info": {
        get: {
          summary: "Compact human and agent-readable product profile",
          description:
            "Returns HTML by default. Returns compact Markdown when Accept includes text/markdown or when format=md is supplied.",
          parameters: [
            {
              name: "format",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["md", "markdown"] },
            },
          ],
          responses: {
            "200": {
              description: "Compact profile as HTML or Markdown",
              content: {
                "text/html": { schema: { type: "string" } },
                "text/markdown": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/info.md": {
        get: {
          summary: "Compact Markdown product and agent factsheet",
          responses: {
            "200": {
              description: "Compact Markdown profile",
              content: {
                "text/markdown": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/ai": {
        get: {
          summary: "Human and agent-readable AI profile",
          description:
            "Returns HTML by default. Returns Markdown when Accept includes text/markdown or when format=md is supplied.",
          parameters: [
            {
              name: "format",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["md", "markdown"] },
            },
          ],
          responses: {
            "200": {
              description: "AI profile as HTML or Markdown",
              content: {
                "text/html": { schema: { type: "string" } },
                "text/markdown": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/ai.md": {
        get: {
          summary: "Canonical Markdown AI and agent profile",
          responses: {
            "200": {
              description: "Markdown profile",
              content: {
                "text/markdown": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/llms.txt": {
        get: {
          summary: "Compact LLM index",
          responses: {
            "200": {
              description: "Compact plain-text profile",
              content: {
                "text/plain": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/llms-full.txt": {
        get: {
          summary: "Full plain-text agent profile",
          responses: {
            "200": {
              description: "Full plain-text profile",
              content: {
                "text/plain": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/agents.md": {
        get: {
          summary: "Full Markdown agent action guide",
          responses: {
            "200": {
              description: "Full Markdown profile with action guidance",
              content: {
                "text/markdown": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/faq.md": {
        get: {
          summary: "FAQ-only Markdown",
          responses: {
            "200": {
              description: "Markdown FAQ",
              content: {
                "text/markdown": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/pricing.md": {
        get: {
          summary: "Pricing-only Markdown",
          responses: {
            "200": {
              description: "Markdown pricing summary",
              content: {
                "text/markdown": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/auth.md": {
        get: {
          summary: "auth.md new-user registration instructions",
          description:
            "Agent registration instructions. This v1 flow never issues an API credential or private-data access.",
          responses: {
            "200": {
              description: "auth.md instructions",
              content: { "text/markdown": { schema: { type: "string" } } },
            },
          },
        },
      },
      "/agent/identity": {
        post: {
          summary: "Start an agent-initiated new-user registration",
          description:
            "Creates a 15-minute claim for an email that does not already have an OghmaNotes account. The user must complete password creation and email verification in the browser. No access token is issued.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["type", "login_hint"],
                  properties: {
                    type: { type: "string", enum: ["service_auth"] },
                    login_hint: { type: "string", format: "email", maxLength: 255 },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Claim URI and user code returned" },
            "400": { description: "Invalid registration request" },
            "409": { description: "Existing account or pending claim" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/agent/identity/claim": {
        post: {
          summary: "Poll an agent registration claim",
          description:
            "Reports pending, registered, or verified status. It never returns an API credential.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["claim_token"],
                  properties: { claim_token: { type: "string", minLength: 64, maxLength: 64 } },
                },
              },
            },
          },
          responses: {
            "200": { description: "Current claim status" },
            "400": { description: "Invalid or expired claim" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/agent/identity/claim/complete": {
        post: {
          summary: "Complete an agent registration claim with OAuth",
          description:
            "Requires an Auth.js browser session whose provider-verified email matches the new-user claim. It never returns an API credential.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["claim_token", "user_code"],
                  properties: {
                    claim_token: { type: "string", minLength: 64, maxLength: 64 },
                    user_code: { type: "string", pattern: "^[0-9]{6}$" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Registration verified" },
            "400": { description: "Mismatched or expired claim" },
            "401": { description: "OAuth browser session required" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/agent-sitemap.xml": {
        get: {
          summary: "Sitemap for machine-readable resources",
          responses: {
            "200": {
              description: "XML sitemap for agent and LLM resources",
              content: {
                "application/xml": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/agent-api.json": {
        get: {
          summary: "Structured agent API document",
          description:
            "OpenAPI-style endpoint guide for agents helping users navigate and operate OghmaNotes.",
          responses: {
            "200": {
              description: "Structured API document",
              content: {
                "application/json": { schema: { type: "object" } },
              },
            },
          },
        },
      },
      "/openapi.json": {
        get: {
          summary: "Standard OpenAPI alias",
          description:
            "Same structured endpoint guide as /agent-api.json, exposed under a conventional OpenAPI URL.",
          responses: {
            "200": {
              description: "Structured API document",
              content: {
                "application/json": { schema: { type: "object" } },
              },
            },
          },
        },
      },
      "/api/auth/register": {
        post: {
          summary: "Create a user account",
          description:
            "Creates an account and requires email verification. Agents should prefer the browser-visible registration flow and must not store user passwords.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email", maxLength: 255 },
                    password: {
                      type: "string",
                      minLength: 8,
                      maxLength: 128,
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Account created; email verification required",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      requiresVerification: { type: "boolean" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
            "400": { description: "Validation failed" },
            "409": { description: "User already exists" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/api/auth/login": {
        post: {
          summary: "Create an authenticated session",
          description:
            "Signs in a verified user and sets session cookies. Agents should use a user-controlled browser session rather than requesting credentials in chat.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email", maxLength: 255 },
                    password: { type: "string", maxLength: 128 },
                    rememberMe: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Authenticated session created" },
            "401": { description: "Invalid email or password" },
            "403": {
              description: "Email verification required or inactive account",
            },
            "429": { description: "Rate limited or account temporarily locked" },
          },
        },
      },
      "/api/chat": {
        post: {
          summary: "Ask an authenticated study question",
          description:
            "Requires an authenticated session cookie. Agents must get confirmation before sending private study material or questions on behalf of a user.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["message"],
                  properties: {
                    message: { type: "string", maxLength: 2000 },
                    stream: { type: "boolean", default: false },
                    useRag: { type: "boolean", default: true },
                    noteId: { type: "string" },
                    noteTitle: { type: "string" },
                    noteIds: { type: "array", items: { type: "string" } },
                    folderIds: { type: "array", items: { type: "string" } },
                    sessionId: { type: "string" },
                    history: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description:
                "Chat answer as JSON or server-sent events when stream=true",
            },
            "400": { description: "Missing or too-long message" },
            "401": { description: "Unauthorized" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/api/notes": {
        get: {
          summary: "List authenticated user's notes",
          description:
            "Requires a signed-in session. Supports optional field selection and pagination.",
          parameters: [
            {
              name: "fields",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Comma-separated response fields.",
            },
            {
              name: "skip",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 0 },
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 200 },
            },
          ],
          responses: {
            "200": { description: "Array of notes and folders" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Create a note or folder",
          description:
            "Requires a signed-in session. Agents should ask before creating content for a user.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string", maxLength: 500 },
                    content: { type: "string" },
                    isFolder: { type: "boolean" },
                    is_folder: { type: "boolean" },
                    pid: {
                      type: "string",
                      description: "Optional parent folder note ID.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Created note or folder" },
            "400": { description: "Validation failed" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/notes/{id}": {
        get: {
          summary: "Read one note",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "fields",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Note object" },
            "400": { description: "Invalid note ID" },
            "401": { description: "Unauthorized" },
            "404": { description: "Note not found" },
          },
        },
        patch: {
          summary: "Update one note",
          description:
            "Requires a signed-in session. Updating content can refresh the note's search index.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string", maxLength: 500 },
                    content: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Updated note object" },
            "400": { description: "Validation failed" },
            "401": { description: "Unauthorized" },
            "404": { description: "Note not found" },
          },
        },
        delete: {
          summary: "Soft-delete one note",
          description:
            "Requires a signed-in session and explicit human confirmation.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": { description: "Deleted: { success: true }" },
            "400": { description: "Invalid note ID" },
            "401": { description: "Unauthorized" },
            "404": { description: "Note not found" },
          },
        },
      },
      "/api/search": {
        get: {
          summary: "Search notes",
          description:
            "Requires a signed-in session. Searches notes by keyword or semantic mode.",
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              schema: { type: "string", minLength: 2 },
            },
            {
              name: "mode",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["keyword", "semantic"] },
            },
            {
              name: "course",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
            {
              name: "exclude",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Comma-separated note IDs to exclude in semantic mode.",
            },
          ],
          responses: {
            "200": { description: "Search results" },
            "400": { description: "Invalid mode" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/global-search": {
        get: {
          summary: "Search notes, chats, and quiz courses",
          description:
            "Requires a signed-in session. Empty or short queries return recent items.",
          parameters: [
            {
              name: "q",
              in: "query",
              required: false,
              schema: { type: "string", maxLength: 200 },
            },
          ],
          responses: {
            "200": {
              description: "Grouped results under notes, chats, and quizzes",
            },
            "401": { description: "Unauthorized" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/api/tree/children": {
        get: {
          summary: "List note tree children",
          description:
            "Requires a signed-in session. Use no parent_id for root children.",
          parameters: [
            {
              name: "parent_id",
              in: "query",
              required: false,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": { description: "Folder children" },
            "400": { description: "Invalid parent_id" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/canvas/connect": {
        get: {
          summary: "Read Canvas connection state and visible courses",
          description:
            "Requires a signed-in session. Responses are no-store because they reflect private Canvas state.",
          responses: {
            "200": { description: "Canvas connection state" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Connect Canvas",
          description:
            "Requires a signed-in session. Agents must not ask users to paste Canvas tokens into chat; prefer the browser-visible settings flow.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["domain", "token"],
                  properties: {
                    domain: {
                      type: "string",
                      pattern: "^[\\w-]+\\.instructure\\.com$",
                    },
                    token: { type: "string", maxLength: 4096 },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Canvas connected" },
            "400": { description: "Invalid token or domain" },
            "401": { description: "Unauthorized" },
            "429": { description: "Rate limited" },
          },
        },
        delete: {
          summary: "Disconnect Canvas",
          description:
            "Requires a signed-in session and explicit human confirmation.",
          responses: {
            "200": { description: "Canvas disconnected" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/canvas/sync": {
        get: {
          summary: "Check Canvas sync availability",
          responses: {
            "200": { description: "Sync availability and active job state" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Queue a Canvas sync job",
          description:
            "Requires a signed-in session and explicit human confirmation because it imports private course material.",
          responses: {
            "200": { description: "Queued job or reason sync was unavailable" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/canvas/status": {
        get: {
          summary: "Read Canvas import progress",
          responses: {
            "200": { description: "Active job, progress, issues, and recent logs" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/assignments": {
        get: {
          summary: "List assignments",
          description:
            "Requires a signed-in session. Supports status, course, archive, and time-window filters.",
          parameters: [
            {
              name: "status",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
            {
              name: "course",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
            {
              name: "all",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["1"] },
            },
            {
              name: "includeArchived",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["1"] },
            },
            {
              name: "windowDays",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 730 },
            },
          ],
          responses: {
            "200": { description: "Assignments" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Create a manual assignment",
          description:
            "Requires a signed-in session and explicit human confirmation.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title"],
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    course_name: { type: "string" },
                    course_color: { type: "string" },
                    due_at: { type: "string", format: "date-time" },
                    estimated_hours: { type: "number" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Created assignment" },
            "400": { description: "Title is required" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/calendar/token": {
        get: {
          summary: "Read private iCal subscription token",
          description:
            "Requires a signed-in session. Treat this token as private because it grants calendar feed access.",
          responses: {
            "200": { description: "Current calendar export token" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Rotate private iCal subscription token",
          description:
            "Requires a signed-in session and explicit human confirmation because old calendar URLs stop working.",
          responses: {
            "200": { description: "New calendar export token" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/mcp/canvas": {
        post: {
          summary: "Internal Canvas MCP bridge",
          description:
            "Internal streamable HTTP MCP endpoint for Canvas tools. Requires an internal bearer token minted by OghmaNotes; it is not a public end-user MCP endpoint.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
          responses: {
            "200": { description: "MCP JSON response" },
            "401": { description: "Missing or invalid internal MCP token" },
            "403": { description: "Canvas account not connected" },
            "500": { description: "Canvas MCP request failed" },
          },
        },
      },
      "/contact": {
        get: {
          summary: "Contact form for beta, support, billing, and pilots",
          description:
            "There is no first-party public contact POST API documented for agents. Agents should use the visible form with confirmation or draft an email to contact@oghmanotes.ie.",
          responses: {
            "200": {
              description: "Contact page",
              content: {
                "text/html": { schema: { type: "string" } },
              },
            },
          },
        },
      },
    },
  };

  return decorateAgentOpenApiDocument(document);
}

export function agentMarkdownHeaders(
  contentType = "text/markdown",
  canonicalPath = "/ai.md",
  alternatePath = "/ai",
) {
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

export function buildAgentSitemapXml(baseUrl = getBaseUrl()) {
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
