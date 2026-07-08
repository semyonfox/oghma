import {
  AGENT_RESOURCE_PATHS,
  AI_USER_AGENTS,
  getBaseUrl,
} from "@/lib/public/agent-content";

const BASE_URL = getBaseUrl();
const AI_READABLE_PATHS = ["/", ...AGENT_RESOURCE_PATHS];

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
      {
        userAgent: AI_USER_AGENTS,
        allow: AI_READABLE_PATHS,
      },
    ],
    sitemap: [`${BASE_URL}/sitemap.xml`, `${BASE_URL}/agent-sitemap.xml`],
  };
}
