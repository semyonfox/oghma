import {
  agentMarkdownHeaders,
  buildCompactAgentMarkdown,
} from "@/lib/public/agent-content";

export function GET() {
  return new Response(buildCompactAgentMarkdown(), {
    headers: agentMarkdownHeaders("text/plain", "/llms.txt", "/info"),
  });
}
