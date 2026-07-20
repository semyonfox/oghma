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
    expect(body).toContain("# OghmaNotes Agent Guide");
    expect(body).toContain("## Quick Route Matrix");
    expect(body).toContain("## Agent Action Guide");
    expect(body).toContain("https://oghmanotes.ie/auth.md");
    expect(body).toContain("https://oghmanotes.ie/openapi.json");
  });

  it("publishes auth.md discovery without advertising private API access", async () => {
    const response = authMarkdown();
    const body = await response.text();
    const protectedResource = await protectedResourceMetadata().json();
    const authorizationServer = await authorizationServerMetadata().json();

    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(body).toContain("Start registration for a new user");
    expect(body).toContain("does not grant the agent account or API access");
    expect(body).toContain('"claim": {');
    expect(body).toContain("claim.verification_uri");
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
    expect(text).toContain("# OghmaNotes");
    expect(text).toContain("Canvas-connected study workspace");
    expect(text).toContain("[OpenAPI](https://oghmanotes.ie/openapi.json)");
    expect(text).toContain("## Register A New User As An Agent");
    expect(text).toContain("POST https://oghmanotes.ie/agent/identity");
    expect(text).toContain("claim.verification_uri");
    expect(text.length).toBeLessThan(1500);
    expect(fullText).toContain("# OghmaNotes Agent Guide");
    expect(await aiMarkdown().text()).toBe(fullText);
    expect(fullText.length).toBeLessThan(2500);
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
    expect(body).toContain("# OghmaNotes");
    expect(body).toContain("## Register A New User As An Agent");
    expect(body).toContain("https://oghmanotes.ie/auth.md");
    expect(body).toContain("https://oghmanotes.ie/openapi.json");
  });

  it("serves FAQ and pricing as purpose-specific markdown", async () => {
    const faq = await faqMarkdown().text();
    const pricing = await pricingMarkdown().text();

    expect(faq).toContain("# OghmaNotes FAQ");
    expect(faq).toContain("## What is OghmaNotes?");
    expect(pricing).toContain("# OghmaNotes Pricing");
    expect(pricing).toContain("closed beta");
    expect(pricing).toContain("Paid checkout is not enabled");
    expect(pricing).toContain("| Free first import | EUR 0 |");
    expect(pricing).toContain("| Semester | EUR 39–49 |");
    expect(pricing).toContain("| Academic year | EUR 79–89 |");
    expect(pricing).not.toMatch(/EUR 10 \/ month|EUR 18 \/ month|Standard|Premium/);
    expect(faq).not.toBe(pricing);
  });

  it("keeps public machine copy within product claim boundaries", async () => {
    const compact = await infoMarkdown().text();
    const full = await agentsMarkdown().text();
    const faq = await faqMarkdown().text();
    const pricing = await pricingMarkdown().text();
    const allCopy = [compact, full, faq, pricing].join("\n");

    expect(allCopy).toContain("Canvas access depends on the institution");
    expect(allCopy).toContain("AI answers and generated study material can be wrong");
    expect(allCopy).toContain("closed beta");
    expect(allCopy).toContain("not an official university or Canvas service");
    expect(allCopy).toContain("Paid checkout is not enabled");
    expect(allCopy).not.toMatch(
      /available feedback|automatic (?:exam|revision) plan|unlimited (?:AI|storage|use)|official University of Galway service/i,
    );
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
