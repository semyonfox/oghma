# Agent Compatibility

> Status: Active engineering reference
>
> Audience: Product, web, API, security, and growth maintainers
>
> Last verified: 2026-07-12 against `src/app`, `src/proxy.ts`, and
> `src/lib/public/agent-content.js`

OghmaNotes should be inexpensive for assistants to understand and safe for
user-delegated agents to operate. Those are separate goals:

- **Discovery** exposes public, canonical facts in predictable formats.
- **Read-only use** lets an agent navigate or summarize public information
  without receiving private data or changing state.
- **Actions** use explicit, authenticated, validated flows that preserve the
  user's intent. Discoverability never grants authority.

This document records the current implementation and its gaps. It is not a
promise that every app API is suitable for autonomous use.

## Capability Classes

| Class | Examples | Required boundary |
|---|---|---|
| Public discovery | HTML pages, Markdown aliases, sitemaps, `robots.txt` | No private data; stable facts; correct content types |
| Public read-only | Product, pricing, FAQ, and API-description content | No state change; no implied product guarantees |
| Low-risk intent capture | A future first-party contact-intent endpoint | Validation, rate limits, idempotency, sender verification, moderation |
| Authenticated private read | Study chat over a user's notes and Canvas data | User session, ownership checks, explicit user request |
| State-changing action | Registration, login, imports, account changes, messages | Typed input, human confirmation, rate limits, auditability, least privilege |

## Verified Public Surfaces

All rows below describe current code, not desired future behavior.

| Surface | Current behavior | Class |
|---|---|---|
| `/ai`, `/info`, `/pricing` | Public HTML. `src/proxy.ts` rewrites to Markdown when the request asks for Markdown or uses `?format=md`/`markdown`. | Discovery/read-only |
| `/ai.md`, `/agents.md` | Full public `text/markdown` agent profile and action guide. | Discovery/read-only |
| `/info.md`, `/faq.md`, `/pricing.md` | Purpose-specific compact facts, FAQ, and pricing documents using `text/markdown`. | Discovery/read-only |
| `/llms.txt`, `/llms-full.txt` | Compact index and full profile using `text/plain`. | Discovery/read-only |
| `/auth.md` | Agent-initiated registration instructions for previously unknown users. The person completes a matching verified Google/GitHub OAuth flow or chooses a password and verifies their email in the browser. | Discovery/low-risk intent capture |
| `/agent-api.json`, `/openapi.json` | Public OpenAPI 3.1 JSON aliases for the documented agent surface. Operations include IDs, tags, security hints, and agent-safety metadata. This is not a promise that every app API is autonomous-agent safe. | Discovery |
| `/agent-sitemap.xml` | Lists the agent-resource paths from `AGENT_RESOURCE_PATHS`. | Discovery |
| `/sitemap.xml` | Includes public product pages, agent resources, blog posts, and the syntax guide. | Discovery |
| `/robots.txt` | Generated from `src/app/robots.js`; points to both sitemaps and emits the user-agent list owned by current code. | Discovery policy |

The direct Markdown routes emit route-specific canonical/alternate HTTP `Link`
headers. The root HTML layout advertises the compact Markdown profile,
`llms.txt`, OpenAPI document, and agent sitemap with `<link>` elements.

## Documented Action Surface

`/agent-api.json` advertises selected public and authenticated routes; it is not
a complete inventory of the application's APIs. These routes illustrate the
highest-risk boundaries:

| Route | State and data boundary | Agent rule |
|---|---|---|
| `POST /api/auth/register` | Creates an account and starts verification. | Prefer the visible registration flow; never ask for or retain a password. Confirm before submission. |
| `POST /api/auth/login` | Creates an authenticated browser session. | Keep credential entry under user control. Do not request cookies or credentials in chat. |
| `POST /agent/identity` | Starts a short-lived registration claim for a new email address. | Give the person the returned URI and six-digit code; OAuth and email proof remain in the user's browser. Never request a password, provider token, cookie, or email-verification token. This does not issue an API credential. |
| `POST /api/chat` | Uses a signed-in user's private study context and may persist chat state. | Require an explicit user request and the normal session/ownership checks. |
| `GET /contact` | Opens the human-readable contact page. No first-party public contact POST API is documented. | Draft or navigate only; confirm before submitting the visible form. |

The document also covers selected notes, search, tree, Canvas connection and
sync, assignments, calendar-token, and hosted-MCP routes. Their security and
confirmation metadata describes intended use, but discovery is not authority:
agents must still follow normal authentication, ownership, and confirmation
checks. Do not infer that an undocumented route is agent-safe.

## Known Gaps

- The hand-maintained OpenAPI document still needs stronger response schemas
  and can drift from route validation or response behavior.
- There is no public remote MCP server with user OAuth, narrowed tools,
  confirmation boundaries, and audit logging.
- There is no first-party, spam-resistant contact-intent API with sender
  verification and idempotency.
- The canonical machine-readable profile currently includes a raw contact
  email address. Reassess that exposure before promoting it as the preferred
  agent contact path.

These are implementation gaps, not documentation tasks that can be checked off
without corresponding code and tests.

## Safety and Spam Boundaries

- Agents act with the signed-in user's authority, never as a superuser.
- Private notes, Canvas data, assignments, chat history, and account data use
  the same session and ownership checks as the UI.
- Confirm before creating accounts, submitting forms, importing data, sending
  messages, rotating tokens, changing accounts, or asking questions over
  private material.
- Never request passwords, session cookies, verification codes, recovery
  codes, Canvas tokens, or API keys through conversational prompts.
- Public machine-readable content must not become a directory of private
  routing addresses or operational secrets.
- If a contact API is added, require bounded schemas, IP/email/fingerprint rate
  limits, idempotency, a honeypot on the HTML form, sender verification, and a
  moderation path before delivery.
- Treat `robots.txt` as crawler guidance, not access control or secrecy.
- Verify vendor crawler names and policies against current official sources
  before changing `src/app/robots.js`; this document does not define them.

## Content Rules

Public agent-facing facts should answer, in plain language:

- what OghmaNotes is and who it is for;
- what Canvas access can and cannot provide;
- what the product costs or whether pricing is provisional;
- which claims are evidenced by current behavior;
- which actions require a session or confirmation;
- how a user can recover, export, or delete their data.

Avoid unverifiable comparisons, grade guarantees, and language that implies
institutional endorsement. Update the canonical builder rather than allowing
aliases to diverge accidentally.

## Acceptance Checks

Run these after changing public agent surfaces:

1. `npm run test -- --run src/__tests__/app/agent-content-routes.test.ts src/__tests__/app/proxy-markdown.test.ts`
2. Confirm `/ai`, `/info`, and `/pricing` return HTML by default.
3. Confirm each returns Markdown for `Accept: text/markdown` and sets
   `Vary: Accept`.
4. Confirm direct `.md` routes use `text/markdown; charset=utf-8` and `.txt`
   routes use `text/plain; charset=utf-8`.
5. Confirm `/agent-api.json` and `/openapi.json` return the same valid JSON and
   do not document routes that lack the stated auth or validation behavior.
6. Confirm both sitemaps contain only public, intended URLs.
7. Review generated `robots.txt` without assuming it protects private routes.
8. Confirm machine-readable surfaces expose no secrets, tokens, private study
   data, or unapproved contact routing.
9. Exercise browser-visible state-changing flows with a test account and verify
   that confirmation, auth, ownership, and rate-limit behavior still match the
   documentation.

## Maintenance

The implementation sources of truth are:

- `src/lib/public/agent-content.js` for the canonical profile, resource map,
  OpenAPI-shaped guide, and agent sitemap;
- `src/proxy.ts` for Markdown negotiation;
- `src/app/robots.js` and `src/app/sitemap.js` for generated discovery policy;
- the actual API routes and their tests for action behavior.

Update this reference in the same change when those boundaries change. Keep
research notes and vendor-policy history outside this active engineering
contract.
