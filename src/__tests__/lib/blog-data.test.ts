import { describe, expect, it } from "vitest";
import { blogPosts, findBlogPost } from "@/lib/blog-data";

describe("findBlogPost", () => {
  it("finds published posts by slug", () => {
    const [first] = blogPosts;
    expect(findBlogPost(first.slug)).toBe(first);
  });

  it("treats inherited object keys from the URL as unknown posts", () => {
    for (const slug of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(findBlogPost(slug)).toBeUndefined();
    }
  });
});
