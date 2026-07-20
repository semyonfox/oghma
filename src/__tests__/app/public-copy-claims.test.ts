import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("public copy claim boundaries", () => {
  it("keeps root and homepage metadata focused on the connected Canvas workflow", () => {
    const metadataSources = `${read("src/app/layout.js")}\n${read("src/app/page.js")}`;

    expect(metadataSources).toContain("Canvas-connected study workspace");
    expect(metadataSources).toContain("Connect Canvas once");
    expect(metadataSources).toContain("planning connected");
    expect(metadataSources).not.toMatch(
      /RAG-powered|AI-enhanced|exam revision plan/i,
    );
  });

  it("renders each blog section once and routes its beta CTA safely", () => {
    const source = read("src/app/blog/[slug]/page.jsx");

    expect(source.match(/t\(post\.section2Content\)/g)).toHaveLength(1);
    expect(source).toContain("#contact-form");
    expect(source).toContain('data-marketing-cta="request_beta_access"');
    expect(source).not.toContain('href="/register"');
  });

  it("removes the unsupported scale claim from every locale", () => {
    const localeDirectory = path.join(root, "src/locales");
    const dictionaries = fs
      .readdirSync(localeDirectory)
      .filter((name) => name.endsWith(".json") && name !== "STRINGS_MAPPING_EN_FR.json")
      .map((name) => JSON.parse(read(`src/locales/${name}`)));

    expect(JSON.stringify(dictionaries)).not.toMatch(/thousands of students/i);
    for (const dictionary of dictionaries) {
      expect(dictionary["blog.cta.description"]).toEqual(expect.any(String));
      expect(dictionary["blog.cta.description"].trim()).not.toBe("");
      expect(dictionary["blog.cta.description"]).toContain("Canvas");
      expect(dictionary["blog.cta.description"]).not.toMatch(/\d/);
      expect(dictionary["blog.cta.description"]).not.toBe(
        "Join thousands of students and educators already using OghmaNotes to transform their learning experience.",
      );
    }
    expect(JSON.parse(read("src/locales/en.json"))["blog.cta.description"]).toBe(
      "Join the closed beta to try a limited Canvas import and help shape what comes next.",
    );
  });
});
