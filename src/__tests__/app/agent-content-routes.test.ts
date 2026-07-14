import { describe, expect, it } from "vitest";

import { GET as agentSitemap } from "@/app/agent-sitemap.xml/route";
import { GET as agentApi } from "@/app/agent-api.json/route";
import { GET as aiMarkdown } from "@/app/ai.md/route";
import { GET as authMarkdown } from "@/app/auth.md/route";
import { GET as authorizationServerMetadata } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as protectedResourceMetadata } from "@/app/.well-known/oauth-protected-resource/route";
import { GET as agentsMarkdown } from "@/app/agents.md/route";
import { GET as faqMarkdown } from "@/app/faq.md/route";
import { GET as infoMarkdown } from "@/app/info.md/route";
import { GET as llmsFullText } from "@/app/llms-full.txt/route";
import { GET as llmsText } from "@/app/llms.txt/route";
import { GET as openApi } from "@/app/openapi.json/route";
import { GET as pricingMarkdown } from "@/app/pricing.md/route";

describe("agent-readable content routes", () => {
  it("serves the canonical AI profile as markdown", async () => {
    const response = aiMarkdown();
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(response.headers.get("content-location")).toBe(
      "https://oghmanotes.ie/ai.md",
    );
    expect(body).toContain("# OghmaNotes Agent Profile");
    expect(body).toContain("## Quick Route Matrix");
    expect(body).toContain("## Agent Action Guide");
    expect(body).toContain("POST https://oghmanotes.ie/api/auth/register");
    expect(body).toContain("GET https://oghmanotes.ie/ai?format=md");
    expect(body).toContain("GET https://oghmanotes.ie/info?format=md");
  });

  it("publishes auth.md discovery without advertising private API access", async () => {
    const response = authMarkdown();
    const body = await response.text();
    const protectedResource = await protectedResourceMetadata().json();
    const authorizationServer = await authorizationServerMetadata().json();

    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(body).toContain("agent-initiated registration for new users only");
    expect(body).toContain("does not issue agent access tokens");
    expect(protectedResource.scopes_supported).toEqual([]);
    expect(authorizationServer.agent_auth).toMatchObject({
      skill: "https://oghmanotes.ie/auth.md",
      identity_types_supported: ["service_auth"],
      credentials_issued: false,
    });
  });

  it("serves compact and full LLM text resources separately", async () => {
    const compactResponse = llmsText();
    const text = await compactResponse.text();
    const fullText = await llmsFullText().text();
    const agentText = await agentsMarkdown().text();

    expect(compactResponse.headers.get("content-type")).toContain(
      "text/plain",
    );
    expect(compactResponse.headers.get("content-location")).toBe(
      "https://oghmanotes.ie/llms.txt",
    );
    expect(text).toContain("# OghmaNotes Info");
    expect(text).toContain("> OghmaNotes is an AI study workspace");
    expect(text).toContain(
      "[OpenAPI](https://oghmanotes.ie/openapi.json)",
    );
    expect(text).toContain("## Endpoint Quickstart");
    expect(fullText).toContain("# OghmaNotes Agent Profile");
    expect(fullText).toBe(agentText);
    expect(text).not.toBe(fullText);
  });

  it("serves a compact markdown info page", async () => {
    const response = infoMarkdown();
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(response.headers.get("content-location")).toBe(
      "https://oghmanotes.ie/info.md",
    );
    expect(body).toContain("# OghmaNotes Info");
    expect(body).toContain("## Agent And LLM Files");
    expect(body).toContain("https://oghmanotes.ie/agent-api.json");
    expect(body).toContain("https://oghmanotes.ie/openapi.json");
  });

  it("serves FAQ and pricing as purpose-specific markdown", async () => {
    const faq = await faqMarkdown().text();
    const pricing = await pricingMarkdown().text();

    expect(faq).toContain("# OghmaNotes FAQ");
    expect(faq).toContain("## What is OghmaNotes?");
    expect(pricing).toContain("# OghmaNotes Pricing");
    expect(pricing).toContain("| Standard | EUR 10 / month |");
    expect(faq).not.toBe(pricing);
  });

  it("serves an agent sitemap with machine-readable resources", async () => {
    const response = agentSitemap();
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(body).toContain("<loc>https://oghmanotes.ie/info</loc>");
    expect(body).toContain("<loc>https://oghmanotes.ie/info.md</loc>");
    expect(body).toContain("<loc>https://oghmanotes.ie/ai.md</loc>");
    expect(body).toContain("<loc>https://oghmanotes.ie/agents.md</loc>");
    expect(body).toContain("<loc>https://oghmanotes.ie/agent-api.json</loc>");
    expect(body).toContain("<loc>https://oghmanotes.ie/openapi.json</loc>");
    expect(body).toContain("<loc>https://oghmanotes.ie/llms.txt</loc>");
    expect(body).toContain("<loc>https://oghmanotes.ie/llms-full.txt</loc>");
    expect(body).toContain("<loc>https://oghmanotes.ie/auth.md</loc>");
  });

  it("serves a structured agent API document", async () => {
    const response = agentApi();
    const body = await response.json();

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body.openapi).toBe("3.1.0");
    expect(body.tags.map((tag: { name: string }) => tag.name)).toEqual([
      "Discovery",
      "Auth",
      "Notes",
      "Search",
      "Chat",
      "Canvas",
      "Assignments",
      "Calendar",
      "MCP",
      "Contact",
    ]);
    expect(body.components.securitySchemes.sessionCookie).toMatchObject({
      type: "apiKey",
      in: "cookie",
      name: "session",
    });
    expect(body.components.securitySchemes.internalMcpBearer).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(body.paths["/info"].get.summary).toBe(
      "Compact human and agent-readable product profile",
    );
    expect(body.paths["/api/notes"].get.summary).toBe(
      "List authenticated user's notes",
    );
    expect(body.paths["/api/notes"].get.operationId).toBe("getNotes");
    expect(body.paths["/api/notes"].get.tags).toEqual(["Notes"]);
    expect(body.paths["/api/notes"].get.security).toEqual([
      { sessionCookie: [] },
    ]);
    expect(body.paths["/api/notes"].get["x-private-data"]).toBe(true);
    expect(body.paths["/api/notes"].post["x-human-confirmation-required"]).toBe(
      true,
    );
    expect(body.paths["/api/search"].get.summary).toBe("Search notes");
    expect(body.paths["/api/canvas/connect"].post.summary).toBe(
      "Connect Canvas",
    );
    expect(body.paths["/api/auth/register"].post.summary).toBe(
      "Create a user account",
    );
    expect(body.paths["/agent/identity"].post.summary).toBe(
      "Start an agent-initiated new-user registration",
    );
    expect(
      body.paths["/agent/identity"].post[
        "x-human-confirmation-required"
      ],
    ).toBe(true);
    expect(body.paths["/agent/identity/claim"].post.summary).toBe(
      "Poll an agent registration claim",
    );
    expect(body.paths["/agent/identity/claim/complete"].post.summary).toBe(
      "Complete an agent registration claim with OAuth",
    );
    expect(
      body.paths["/api/auth/register"].post[
        "x-human-confirmation-required"
      ],
    ).toBe(true);
    expect(body.paths["/api/chat"].post.requestBody.required).toBe(true);
    expect(body.paths["/api/chat"].post["x-private-data"]).toBe(true);
    expect(body.paths["/api/chat"].post["x-human-confirmation-required"]).toBe(
      true,
    );
    expect(body.paths["/api/mcp/canvas"].post.operationId).toBe(
      "postMcpCanvas",
    );
    expect(body.paths["/api/mcp/canvas"].post.security).toEqual([
      { internalMcpBearer: [] },
    ]);
    expect(body.paths["/api/mcp/canvas"].post["x-internal-only"]).toBe(true);
  });

  it("serves the same API document from the conventional OpenAPI alias", async () => {
    const agentResponse = agentApi();
    const openApiResponse = openApi();

    expect(openApiResponse.headers.get("content-type")).toContain(
      "application/json",
    );
    expect(openApiResponse.headers.get("content-location")).toBe(
      "https://oghmanotes.ie/openapi.json",
    );
    expect(openApiResponse.headers.get("link")).toContain(
      "https://oghmanotes.ie/agent-api.json",
    );
    await expect(openApiResponse.json()).resolves.toEqual(
      await agentResponse.json(),
    );
  });
});
