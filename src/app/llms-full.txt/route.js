import {
  agentMarkdownHeaders,
  buildAgentMarkdown,
} from "@/lib/public/agent-content";

export function GET() {
  return new Response(buildAgentMarkdown(), {
    headers: agentMarkdownHeaders("text/plain", "/llms-full.txt", "/ai"),
  });
}
