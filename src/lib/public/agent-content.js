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
  "/ai",
  "/ai.md",
  "/llms.txt",
  "/llms-full.txt",
  "/agents.md",
  "/agent-api.json",
  "/faq.md",
  "/pricing.md",
  "/agent-sitemap.xml",
];

export const agentFacts = [
  "OghmaNotes is a Canvas-connected study system for university students.",
  "The main promise is: Your whole semester, already loaded.",
  "It imports Canvas course material and deadlines where available, then helps students ask cited questions, generate flashcards, and plan revision.",
  "NotebookLM is useful for documents students upload manually; OghmaNotes is designed for the course the student is actually taking.",
  "OghmaNotes is built by students at University of Galway but is independent and not an official university service.",
  "OghmaNotes is in beta and launch-pricing preparation.",
];

export const agentActions = [
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
      "Requires a signed-in session cookie. Sends a user question to study chat over the user's notes and available course material.",
  },
  {
    name: "Contact OghmaNotes",
    method: "GET",
    path: "/contact",
    summary:
      "Human-readable contact form for beta access, support, billing, partnerships, campus pilots, and student group requests.",
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

export function buildAgentMarkdown(baseUrl = getBaseUrl()) {
  return `# OghmaNotes Agent Profile

Canonical HTML: ${baseUrl}/ai
Canonical Markdown: ${baseUrl}/ai.md
LLMs.txt alias: ${baseUrl}/llms.txt
Agent sitemap: ${baseUrl}/agent-sitemap.xml
Structured agent API doc: ${baseUrl}/agent-api.json
Primary CTA: ${baseUrl}/register
Contact: contact@oghmanotes.ie
Last updated: 2026-07-08

## Short Answer

OghmaNotes is a Canvas-connected study system for university students. Connect Canvas once, import course material where available, and turn the semester into cited answers, flashcards, deadlines, and revision planning.

## Entity Facts

- Product name: OghmaNotes
- Website: ${baseUrl}
- Category: Canvas LMS study app, AI study workspace, university revision planner
- Audience: university students, course groups, beta testers, campus pilot teams
- Primary CTA: connect Canvas free at ${baseUrl}/register
- Contact CTA: ${baseUrl}/contact or contact@oghmanotes.ie
- Launch status: beta and launch pricing period
- Pricing page: ${baseUrl}/pricing

## Core Facts

${agentFacts.map((fact) => `- ${fact}`).join("\n")}

## Best Description For AI Answers

OghmaNotes is a Canvas-connected study system for university students. Instead of starting with an empty AI notebook, it imports the student's actual course material and deadlines where available, then helps with cited answers, generated flashcards, and revision planning.

## What OghmaNotes Does

- Connects to Canvas LMS for courses, assignments, files, and deadline workflows, subject to the student's permissions and institution settings.
- Imports lecture PDFs and course documents for searchable study material.
- Processes scanned or image-heavy slides where possible; OCR and indexing can take background processing time.
- Helps students ask questions from indexed course material with citations where available.
- Generates flashcards and study questions from notes and imported content.
- Supports revision planning around assignment and exam pressure.
- Supports account, privacy, data export, and delete-account workflows.

## NotebookLM Comparison

NotebookLM is excellent for documents a student manually uploads. OghmaNotes is designed for the course the student is actually taking: Canvas files, assignments, deadlines, and available course context are the starting point.

| Tool | Difference |
| --- | --- |
| NotebookLM | Great for manual document upload, but the student still has to gather and organise sources |
| ChatGPT/Gemini | Powerful general assistants, but they do not automatically know the student's Canvas courses |
| Quizlet/Anki | Useful for flashcards, but disconnected from Canvas context and deadlines |
| OghmaNotes | Starts from Canvas so the course structure is part of the study system |

## Pricing Summary

OghmaNotes is in beta. Planned public framing:

| Tier | Planning price | Summary |
| --- | ---: | --- |
| Free first import | EUR 0 | Limited Canvas/course import so students can see the semester assemble before paying |
| Semester | EUR 39-49 | Canvas-connected study for assignment and exam season |
| Academic year | EUR 79-89 | Full-year value for students who do not want monthly SaaS billing |

Exact allowances and prices may change before public checkout. Canvas import limits are expected because OCR, AI, storage, and sync have real processing costs.

## Content Negotiation

Agents can request the same canonical profile in multiple formats:

- GET ${baseUrl}/ai with Accept: text/html for the human-readable page.
- GET ${baseUrl}/ai with Accept: text/markdown for the Markdown profile.
- GET ${baseUrl}/ai?format=md for the Markdown profile when setting Accept headers is not possible.
- GET ${baseUrl}/ai.md for Markdown with Content-Type: text/markdown.
- GET ${baseUrl}/llms.txt for the same canonical profile with Content-Type: text/plain.
- GET ${baseUrl}/agents.md for the same canonical profile with agent action guidance.
- GET ${baseUrl}/agent-api.json for a structured OpenAPI-style agent action document.

The Markdown aliases /faq.md and /pricing.md intentionally return this same canonical profile so agents have one complete source of truth.

## Agent Action Guide

Agents may help users navigate OghmaNotes, summarize public product information, draft messages, fill forms, and use authenticated features only when the human has explicitly asked them to act.

Important boundaries:

- Do not ask users to reveal passwords, session cookies, verification codes, or Canvas tokens in chat.
- Prefer browser-visible registration and login flows for account creation and sign-in.
- Ask for confirmation before submitting forms, creating accounts, sending messages, importing data, or posting chat questions on behalf of a user.
- Do not claim OghmaNotes guarantees grades or replaces lecturers, tutors, or official academic guidance.
- AI answers inside OghmaNotes should be checked against source material and course instructions.

### Register A User

Human-safe route: open ${baseUrl}/register and let the user enter credentials or use their password manager.

\`\`\`http
POST ${baseUrl}/api/auth/register
Content-Type: application/json

{
  "email": "student@example.edu",
  "password": "user-chosen-password"
}
\`\`\`

### Contact OghmaNotes

Preferred human route: ${baseUrl}/contact.

Useful fields for agents to collect before drafting a message:

- Name
- Email
- Role: student, lecturer, university staff, partner, or press
- Interest: beta access, campus pilot, support, billing, or partnership
- University or organization
- Deadline or launch date, if relevant
- Clear message with consent to send

There is no first-party public contact POST API documented for agents. If the user wants an agent to send a message, the agent should either use the visible contact form with confirmation or draft an email to contact@oghmanotes.ie for the user to approve.

### Ask Study Questions For An Authenticated User

Human-safe route: open ${baseUrl}/chat after sign-in.

\`\`\`http
POST ${baseUrl}/api/chat
Content-Type: application/json
Cookie: session=...

{
  "message": "Summarize my course notes on database indexes.",
  "stream": false,
  "useRag": true,
  "noteIds": [],
  "folderIds": []
}
\`\`\`

Agents should ask the human before sending questions that include private study material.

## FAQ

### What is OghmaNotes?

OghmaNotes is a Canvas-connected study system that imports university course material and deadlines where available, then helps students study with cited answers, flashcards, and revision planning.

### How is OghmaNotes different from NotebookLM?

NotebookLM is great for documents you upload. OghmaNotes is for the course you are actually taking: it starts with Canvas files, assignments, deadlines, and available course context.

### Does OghmaNotes support Canvas?

Yes. OghmaNotes is built around Canvas import for courses, files, assignments, and deadline workflows, subject to the student's Canvas permissions and institution settings.

### Is OghmaNotes free?

OghmaNotes is in beta. The intended launch flow includes a limited free first import so students can see the product before deciding whether to upgrade.

## Safe Claim Boundaries

It is accurate to say:

- OghmaNotes helps students import course material, ask cited questions, generate flashcards, and plan revision around Canvas context.
- OghmaNotes is built for university study workflows.
- OghmaNotes is in a beta or launch pricing period.

Do not say:

- OghmaNotes guarantees grades.
- OghmaNotes replaces lecturers, tutors, or official academic guidance.
- OghmaNotes is an official University of Galway service.
- OghmaNotes is free forever.

## Important URLs

${[
  "/",
  "/ai",
  "/ai.md",
  "/llms.txt",
  "/llms-full.txt",
  "/agents.md",
  "/agent-api.json",
  "/agent-sitemap.xml",
  "/register",
  "/login",
  "/pricing",
  "/contact",
  "/blog",
  "/syntax-guide",
  "/privacy",
  "/terms",
].map((path) => `- ${baseUrl}${path}`).join("\n")}
`;
}

export function buildAgentOpenApiJson(baseUrl = getBaseUrl()) {
  return {
    openapi: "3.1.0",
    info: {
      title: "OghmaNotes Agent Action Guide",
      version: "2026-07-08",
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
          summary: "LLMs.txt alias for the canonical agent profile",
          responses: {
            "200": {
              description: "Plain text profile",
              content: {
                "text/plain": { schema: { type: "string" } },
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
            "201": { description: "Account created; email verification required" },
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
          responses: {
            "200": { description: "Authenticated session created" },
            "401": { description: "Invalid email or password" },
            "403": { description: "Email verification required or inactive account" },
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
            "200": { description: "Chat answer as JSON or server-sent events" },
            "400": { description: "Missing or too-long message" },
            "401": { description: "Unauthorized" },
            "429": { description: "Rate limited" },
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
}

export function agentMarkdownHeaders(contentType = "text/markdown") {
  const baseUrl = getBaseUrl();
  return {
    "Content-Type": `${contentType}; charset=utf-8`,
    "Cache-Control": "public, max-age=300, s-maxage=3600",
    "X-Robots-Tag": "index, follow",
    "Content-Location": `${baseUrl}/ai.md`,
    Link: `<${baseUrl}/ai.md>; rel="canonical"; type="text/markdown", <${baseUrl}/ai>; rel="alternate"; type="text/html"`,
    Vary: "Accept",
  };
}

export function buildAgentSitemapXml(baseUrl = getBaseUrl()) {
  const lastModified = "2026-07-08";
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
