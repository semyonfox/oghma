import {
  agentMarkdownHeaders,
  buildAgentMarkdown,
} from "@/lib/public/agent-content";

export function GET() {
  return new Response(buildAgentMarkdown(), {
    headers: agentMarkdownHeaders("text/markdown", "/agents.md", "/ai"),
  });
}
