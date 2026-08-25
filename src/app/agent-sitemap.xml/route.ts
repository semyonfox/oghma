import { buildAgentSitemapXml } from "@/lib/public/agent-content";

export function GET() {
  return new Response(buildAgentSitemapXml(), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "X-Robots-Tag": "index, follow",
    },
  });
}
