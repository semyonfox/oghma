import { describe, expect, it } from "vitest";
import { splitSections } from "@/lib/notes/sections";

describe("splitSections", () => {
  it("keeps heading paths and distinguishes repeated headings", () => {
    const sections = splitSections("# Lecture\nIntro\n## Stacks\nLIFO\n## Stacks\nPush\n# Other\nEnd");
    expect(sections.map(({ title }) => title)).toEqual(["Lecture", "Lecture / Stacks", "Lecture / Stacks", "Other"]);
    expect(new Set(sections.map(({ key }) => key)).size).toBe(4);
    expect(sections[1].text).toBe("## Stacks\nLIFO");
    expect(JSON.parse(sections[2].key)).toEqual([["Lecture", "Stacks"], 3]);
    expect(splitSections("# Lecture\nIntro\n## Stacks\nLIFO\n## Stacks\nPush\n# Other\nEnd")).toEqual(sections);
  });

  it("recognises setext headings and ignores headings inside code fences", () => {
    const sections = splitSections("Lecture\n===\nText\n```md\n# example\n```\nTopic\n---\nMore");
    expect(sections.map(({ title }) => title)).toEqual(["Lecture", "Lecture / Topic"]);
    expect(sections[0].text).toContain("# example");
  });

  it("keeps introductory text and falls back to bounded windows without headings", () => {
    expect(splitSections("intro\n# Topic\nbody")[0].text).toBe("intro");
    const text = "word ".repeat(1000).trim();
    const sections = splitSections(text);
    expect(sections.length).toBeGreaterThan(1);
    expect(sections.every((section) => section.text.length <= 1500)).toBe(true);
    expect(sections.map(({ text }) => text).join(" ")).toBe(text);
    expect(splitSections(" \n ")).toEqual([]);
  });
});
