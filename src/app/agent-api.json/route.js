import { buildAgentOpenApiJson, getBaseUrl } from "@/lib/public/agent-content";

export function GET() {
  const baseUrl = getBaseUrl();
  return Response.json(buildAgentOpenApiJson(baseUrl), {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Content-Location": `${baseUrl}/agent-api.json`,
      "X-Robots-Tag": "index, follow",
      Link: `<${baseUrl}/agent-api.json>; rel="canonical"; type="application/json", <${baseUrl}/openapi.json>; rel="alternate"; type="application/json"`,
    },
  });
}
