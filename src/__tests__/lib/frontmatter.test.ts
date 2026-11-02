import { describe, expect, it } from "vitest";
import { addTag, joinFrontmatter, readTags, removeTag, splitFrontmatter } from "@/lib/notes/frontmatter";

// the block list shape Canvas and vault imports already write
const imported = [
  "---",
  'title: "Assignment 1"',
  "tags:",
  "  - university",
  "  - module/ct3531",
  "due: 2026-10-18",
  "---",
  "",
  "# Assignment 1",
  "",
].join("\n");

describe("frontmatter tags", () => {
  it.each([
    ["block list", imported, ["university", "module/ct3531"]],
    ["flow list", "---\ntags: [exam, 'week-3']\n---\nbody", ["exam", "week-3"]],
    ["comma list", "---\ntag: exam, #revise\n---\n", ["exam", "revise"]],
    ["unindented list", "---\ntags:\n- exam\n---\n", ["exam"]],
  ])("reads a %s", (_shape, content, tags) => {
    expect(readTags(content)).toEqual(tags);
  });

  it("ignores #words in the body and a rule that isn't frontmatter", () => {
    expect(readTags("# CSS\n\n#div1 { color: #fff; }\n#onbench $\\leq 4$")).toEqual([]);
    expect(readTags("intro\n---\ntags: exam\n---\n")).toEqual([]);
  });

  it("adds and removes tags without touching other keys or the body", () => {
    const added = addTag(imported, "exam prep");
    expect(added).toBe(imported.replace("  - module/ct3531\n", '  - module/ct3531\n  - "exam prep"\n'));
    expect(readTags(added)).toContain("exam prep");
    expect(removeTag(added, "exam prep")).toBe(imported);
    expect(addTag(imported, "university")).toBe(imported);
  });

  it("creates frontmatter for an untagged note and drops it with the last tag", () => {
    const tagged = addTag("# Notes\n", "exam");
    expect(tagged).toBe("---\ntags:\n  - exam\n---\n\n# Notes\n");
    expect(removeTag(tagged, "exam")).toBe("# Notes\n");
  });
});

describe("splitting frontmatter for the editor", () => {
  it("round-trips the editor's split and join", () => {
    const { frontmatter, body } = splitFrontmatter(imported);
    expect(frontmatter).toBe(imported.slice(0, imported.indexOf("---\n\n") + 4));
    expect(joinFrontmatter(frontmatter, body)).toBe(imported);
    expect(splitFrontmatter("no frontmatter")).toEqual({ frontmatter: "", body: "no frontmatter" });
  });
});
