import { blogPosts } from "@/lib/blog-data";
import { AGENT_RESOURCE_PATHS } from "@/lib/public/agent-content";

const BASE_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://oghmanotes.ie"
).replace(/\/$/, "");

export default function sitemap() {
  const staticRoutes = [
    "/",
    "/about",
    "/blog",
    "/privacy",
    "/terms",
    "/cookies",
    "/pricing",
    "/contact",
    "/ai",
    ...AGENT_RESOURCE_PATHS.filter((path) => path !== "/ai"),
  ];

  return [
    ...staticRoutes.map((path) => ({
      url: `${BASE_URL}${path}`,
    })),
    ...blogPosts.map((post) => ({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.datetime),
    })),
    {
      url: `${BASE_URL}/syntax-guide`,
    },
  ];
}
