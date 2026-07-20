import { describe, expect, it } from "vitest";

import { blogPosts } from "@/lib/blog-data";
import {
  AGENT_RESOURCE_PATHS,
  AI_USER_AGENTS,
} from "@/lib/public/agent-content";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("sitemap metadata route", () => {
  it("lists only the public marketing and blog URLs", () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toEqual([
      "https://oghmanotes.ie/",
      "https://oghmanotes.ie/about",
      "https://oghmanotes.ie/blog",
      "https://oghmanotes.ie/privacy",
      "https://oghmanotes.ie/terms",
      "https://oghmanotes.ie/cookies",
      "https://oghmanotes.ie/pricing",
      "https://oghmanotes.ie/contact",
      "https://oghmanotes.ie/ai",
      ...AGENT_RESOURCE_PATHS.filter((path) => path !== "/ai").map(
        (path) => `https://oghmanotes.ie${path}`,
      ),
      ...blogPosts.map((post) => `https://oghmanotes.ie/blog/${post.slug}`),
      "https://oghmanotes.ie/syntax-guide",
    ]);

    expect(urls).not.toContain("https://oghmanotes.ie/login");
    expect(urls).not.toContain("https://oghmanotes.ie/register");
    expect(urls).not.toContain("https://oghmanotes.ie/notes");
    const blogEntries = entries.filter((entry) => entry.url.includes("/blog/"));
    expect(blogEntries.map((entry) =>
      "lastModified" in entry && entry.lastModified instanceof Date
        ? entry.lastModified.toISOString().slice(0, 10)
        : null,
    )).toEqual(
      blogPosts.map((post) => post.datetime),
    );
    expect(
      entries
        .filter((entry) => !entry.url.includes("/blog/"))
        .every((entry) => !("lastModified" in entry)),
    ).toBe(true);
  });
});

describe("robots metadata route", () => {
  it("allows crawling and points to the generated sitemap", () => {
    expect(robots()).toEqual({
      rules: [
        {
          userAgent: "*",
          allow: "/",
        },
        {
          userAgent: AI_USER_AGENTS,
          allow: ["/", ...AGENT_RESOURCE_PATHS],
        },
      ],
      sitemap: [
        "https://oghmanotes.ie/sitemap.xml",
        "https://oghmanotes.ie/agent-sitemap.xml",
      ],
    });
  });
});
