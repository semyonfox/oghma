import { describe, expect, it } from "vitest";

import { GET as agentSitemap } from "@/app/agent-sitemap.xml/route";
import { GET as agentApi } from "@/app/agent-api.json/route";
import { GET as aiMarkdown } from "@/app/ai.md/route";
import { GET as agentsMarkdown } from "@/app/agents.md/route";
import { GET as llmsText } from "@/app/llms.txt/route";

describe("agent-readable content routes", () => {
  it("serves the canonical AI profile as markdown", async () => {
    const response = aiMarkdown();
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(response.headers.get("content-location")).toBe(
      "https://oghmanotes.ie/ai.md",
    );
    expect(body).toContain("# OghmaNotes Agent Profile");
    expect(body).toContain("Canvas-connected study system");
    expect(body).toContain("## Agent Action Guide");
    expect(body).toContain("POST https://oghmanotes.ie/api/auth/register");
    expect(body).toContain("GET https://oghmanotes.ie/ai?format=md");
  });

  it("serves llms.txt as the same canonical agent profile", async () => {
    const markdown = await agentsMarkdown().text();
    const text = await llmsText().text();

    expect(llmsText().headers.get("content-type")).toContain("text/plain");
    expect(text).toBe(markdown);
  });

  it("serves an agent sitemap with machine-readable resources", async () => {
    const response = agentSitemap();
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(body).toContain("<loc>https://oghmanotes.ie/ai.md</loc>");
    expect(body).toContain("<loc>https://oghmanotes.ie/agents.md</loc>");
    expect(body).toContain("<loc>https://oghmanotes.ie/agent-api.json</loc>");
    expect(body).toContain("<loc>https://oghmanotes.ie/llms.txt</loc>");
  });

  it("serves a structured agent API document", async () => {
    const response = agentApi();
    const body = await response.json();

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body.openapi).toBe("3.1.0");
    expect(body.paths["/api/auth/register"].post.summary).toBe(
      "Create a user account",
    );
    expect(body.paths["/api/chat"].post.requestBody.required).toBe(true);
  });
});
