import { buildAgentOpenApiJson, getBaseUrl } from "@/lib/public/agent-content";

export function GET() {
  const baseUrl = getBaseUrl();
  return Response.json(buildAgentOpenApiJson(baseUrl), {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Content-Location": `${baseUrl}/openapi.json`,
      "X-Robots-Tag": "index, follow",
      Link: `<${baseUrl}/openapi.json>; rel="canonical"; type="application/json", <${baseUrl}/agent-api.json>; rel="alternate"; type="application/json"`,
    },
  });
}
