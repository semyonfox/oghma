import {
  agentMarkdownHeaders,
  buildPricingMarkdown,
} from "@/lib/public/agent-content";

export function GET() {
  return new Response(buildPricingMarkdown(), {
    headers: agentMarkdownHeaders("text/markdown", "/pricing.md", "/pricing"),
  });
}
