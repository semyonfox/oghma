# AI and Agent Compatibility Strategy

Last updated: 2026-07-09

This is the reusable playbook for making OghmaNotes easy for AI systems to
discover, recommend, quote, and operate safely on behalf of users.

## Goals

1. **Be discoverable** by normal search crawlers, AI answer engines, and
   agentic browsers.
2. **Be easy to summarize correctly** from compact, explicit, source-like
   Markdown rather than vague marketing pages.
3. **Be easy for agents to use** through documented API contracts, clear
   authentication expectations, and human-confirmation boundaries.
4. **Be safe with private study data** by treating agent access as delegated
   authority, not as a bypass around the app's permission model.
5. **Be measurable** through a repeatable AI visibility and funnel review loop.

## Research Base

Primary external sources:

- `llms.txt` proposal: https://llmstxt.org/
- OpenAI crawler docs: https://developers.openai.com/api/docs/bots
- Anthropic crawler docs: https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
- Google robots.txt docs: https://developers.google.com/search/docs/crawling-indexing/robots/intro
- Google crawler docs: https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers
- Google software app structured data: https://developers.google.com/search/docs/appearance/structured-data/software-app
- Schema.org `SoftwareApplication`: https://schema.org/SoftwareApplication
- OpenAPI Specification: https://spec.openapis.org/oas/v3.1.0.html
- OpenAPI best practices: https://learn.openapis.org/best-practices.html
- OpenAI GPT Actions docs: https://developers.openai.com/api/docs/actions/getting-started
- OpenAI Apps SDK tool design docs: https://developers.openai.com/apps-sdk/plan/tools
- MCP intro: https://modelcontextprotocol.io/docs/getting-started/intro
- MCP tools spec: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- MCP authorization spec: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- MCP registry: https://modelcontextprotocol.io/registry/about

Local WebExpo notes used:

- `/home/semyon/obsidian/personal/WebExpo 2026/Summaries/Marketing Search and Intelligence Summary.md`
- `/home/semyon/obsidian/personal/WebExpo 2026/Summaries/SaaS Funnel and Growth Summary.md`
- `/home/semyon/obsidian/personal/WebExpo 2026/Summaries/Sales Pricing and Storytelling Summary.md`
- `/home/semyon/obsidian/personal/WebExpo 2026/Summaries/Product UI UX and Accessibility Summary.md`
- `/home/semyon/obsidian/personal/WebExpo 2026/39082775 - From SEO to AIO- The new era of search visibility.md`
- `/home/semyon/obsidian/personal/WebExpo 2026/39082764 - Under the hood of AI- Building your own MCP server in Go.md`
- `/home/semyon/obsidian/personal/WebExpo 2026/39082767 - How to prevent AI Agents from accessing unauthorised data.md`
- `/home/semyon/obsidian/personal/WebExpo 2026/39082679 - From HAL to Replicants Agentic systems and the future of mischief.md`
- `/home/semyon/obsidian/personal/WebExpo 2026/39082727 - Don’t trust the bot- A human framework for evaluating AI copy.md`
- `/home/semyon/obsidian/personal/WebExpo 2026/39082768 - Fixing a broken SaaS funnel- How we turned dead leads into paying users.md`

## Principles

### 1. Answer Engines Need Explicit Answers

AI answer engines reward pages that directly answer:

- what the product is;
- who it is for;
- what problem it solves;
- how it works;
- what it costs;
- how it compares to alternatives;
- who it is not for;
- what evidence supports the claims.

Avoid "marketing fog". Put the short answer, core facts, pricing, FAQ, and
safe claim boundaries in crawlable text.

### 2. Separate Discovery From Action

Discovery resources should be public, compact, stable, and easy to quote:

- `/info`
- `/info.md`
- `/llms.txt`
- `/ai.md`
- `/faq.md`
- `/pricing.md`
- `/agent-sitemap.xml`

Action resources should be typed and explicit:

- `/agent-api.json`
- `/openapi.json`
- authenticated app APIs
- later: a user-facing remote MCP server, once OAuth and tool boundaries are
  ready.

### 3. Markdown Negotiation Matters

Agents should not need to scrape arbitrary HTML when the same content can be
served as Markdown. Support both:

- `GET /info` with `Accept: text/markdown`
- `GET /info?format=md`
- `GET /ai` with `Accept: text/markdown`
- `GET /ai?format=md`

Keep direct files too:

- `/info.md`
- `/ai.md`
- `/llms.txt`
- `/llms-full.txt`

### 4. OpenAPI Should Be Agent-Usable, Not Just Decorative

For each operation:

- provide a short summary;
- provide a concrete description;
- include request and response schemas where practical;
- include `operationId`;
- group operations with tags;
- mark session-authenticated operations;
- mark sensitive operations that need explicit human confirmation.

This helps GPT Actions-style clients, code generators, and general-purpose
agents understand the API without inspecting source code.

### 5. Tool Surfaces Need Safety Boundaries

From the WebExpo agent/MCP/security notes: agent compatibility is also a
permission problem.

Rules for OghmaNotes:

- Agents act on behalf of the signed-in user, never as a superuser.
- Private notes, Canvas data, assignments, and chat history must use the same
  session and ownership checks as the normal UI.
- Destructive or privacy-sensitive actions require human confirmation.
- Calendar token rotation, Canvas connection, imports, account changes, and
  private RAG questions are sensitive.
- Future remote MCP should use OAuth-style authorization, narrow tools, and
  audit logging before public launch.

### 6. Strong Choice Positioning Needs Proof

AIO/search visibility is not only about files. OghmaNotes should expose:

- screenshots or short demos;
- a changelog or "what is new" page;
- transparent pricing;
- privacy/security detail;
- concrete use cases;
- comparison pages;
- examples of student workflows;
- copy written from the user's concern, not from product-team feature lists.

## Current Resource Map

| URL | Role |
| --- | --- |
| `/info` | Compact HTML info page; Markdown by negotiation |
| `/info.md` | Compact Markdown factsheet |
| `/llms.txt` | Compact LLM index |
| `/ai` | Full AI/agent HTML page; Markdown by negotiation |
| `/ai.md` | Full canonical Markdown agent profile |
| `/llms-full.txt` | Full plain-text profile |
| `/agents.md` | Full agent action guide |
| `/faq.md` | FAQ-only Markdown |
| `/pricing.md` | Pricing-only Markdown |
| `/agent-api.json` | OpenAPI-style agent endpoint guide |
| `/openapi.json` | Standard OpenAPI alias |
| `/agent-sitemap.xml` | Sitemap for agent/LLM resources |
| `/sitemap.xml` | Normal public sitemap |
| `/robots.txt` | Search and AI crawler policy |

## Implementation Checklist

Already implemented:

- [x] Public sitemap includes public marketing and agent-readable resources.
- [x] Robots points to both `/sitemap.xml` and `/agent-sitemap.xml`.
- [x] AI crawler user agents are explicitly listed.
- [x] `/ai` supports Markdown negotiation.
- [x] `/info` supports Markdown negotiation.
- [x] `/pricing` supports Markdown negotiation.
- [x] Purpose-specific Markdown routes exist.
- [x] `/agent-api.json` exposes structured API docs.
- [x] `/openapi.json` aliases the structured API docs.
- [x] OpenAPI operations include `operationId`, tags, auth hints, and
      agent-safety metadata.
- [x] Sensitive/private OpenAPI operations are marked with
      `x-human-confirmation-required` and `x-private-data` where relevant.
- [x] HTML pages advertise Markdown/OpenAPI alternates through `<link>` tags.

Next high-value work:

- [ ] Add a public changelog or product updates page and include it in
      `/llms.txt`.
- [ ] Add comparison pages such as "OghmaNotes vs generic AI chat" and
      "OghmaNotes vs Obsidian plus plugins".
- [ ] Add a short demo/video page or annotated screenshots page.
- [ ] Add structured FAQ JSON-LD where FAQ content is shown in HTML.
- [ ] Add stronger response schemas to `/openapi.json`.
- [ ] Add a read-only public MCP discovery card only after the MCP server shape
      is intentionally chosen.
- [ ] Build a user-authenticated remote MCP server only after OAuth,
      relationship-aware authorization, tool narrowing, and audit logging are
      designed.

## AI Visibility Review Loop

Monthly:

1. Ask ChatGPT, Claude, Perplexity, Gemini, Google AI mode, and Bing/Copilot:
   "What is OghmaNotes?", "best AI study app for Canvas", and "OghmaNotes
   pricing".
2. Record whether OghmaNotes is mentioned, cited, described correctly, and
   linked to the right CTA.
3. Check crawler logs for `/llms.txt`, `/info.md`, `/ai.md`,
   `/agent-api.json`, and `/agent-sitemap.xml`.
4. Review Search Console queries and landing pages.
5. Update compact facts, FAQ, pricing, and comparison content based on wrong or
   missing answers.
6. Tie changes to funnel metrics: registration, activation, contact form,
   Canvas connect, first note import, and first cited chat answer.

## Copy Review Questions

Use these before publishing AI-facing or sales-facing copy:

- What user concern does this answer?
- Would a helpful human actually say this?
- Is the copy written from the student's perspective or the product team's?
- Is the claim backed by product behavior, screenshot, pricing, docs, or a
  source?
- Can an answer engine quote this without losing context?
- Does the CTA say what happens next?

## Agent Safety Review Questions

Use these before exposing a new endpoint to agents:

- What private data can this reveal?
- What user-visible state can this change?
- Can the user undo it?
- Does it need explicit confirmation?
- Does it use the same auth and ownership checks as the UI?
- Is the request shape typed and bounded?
- Is there an audit trail for later support/debugging?
- Is this better as REST, MCP, or browser-visible UI?
