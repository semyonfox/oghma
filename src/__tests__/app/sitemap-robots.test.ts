import { describe, expect, it } from "vitest";

import { blogPosts } from "@/lib/blog-data";
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
      ...blogPosts.map((post) => `https://oghmanotes.ie/blog/${post.slug}`),
      "https://oghmanotes.ie/syntax-guide",
    ]);

    expect(urls).not.toContain("https://oghmanotes.ie/login");
    expect(urls).not.toContain("https://oghmanotes.ie/register");
    expect(urls).not.toContain("https://oghmanotes.ie/notes");
    expect(entries.every((entry) => entry.lastModified instanceof Date)).toBe(
      true,
    );
  });
});

describe("robots metadata route", () => {
  it("allows crawling and points to the generated sitemap", () => {
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
      },
      sitemap: "https://oghmanotes.ie/sitemap.xml",
    });
  });
});
