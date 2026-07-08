import { buildAgentOpenApiJson } from "@/lib/public/agent-content";

export function GET() {
  return Response.json(buildAgentOpenApiJson(), {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "X-Robots-Tag": "index, follow",
    },
  });
}
