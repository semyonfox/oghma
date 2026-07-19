import {
  agentMarkdownHeaders,
  buildFaqMarkdown,
} from "@/lib/public/agent-content";

export function GET() {
  return new Response(buildFaqMarkdown(), {
    headers: agentMarkdownHeaders("text/markdown", "/faq.md", "/ai"),
  });
}
