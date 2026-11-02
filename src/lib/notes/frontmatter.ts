// a note's YAML frontmatter is the only place tags live, as in Obsidian.
// Milkdown and the preview don't understand frontmatter, so both get the body
// alone and the editor puts the frontmatter back when it saves

const FRONTMATTER = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;
const TAG_KEY = /^tags?[ \t]*:[ \t]*(.*)$/i;
const LIST_ITEM = /^[ \t]+-[ \t]*(.*)$|^-[ \t]+(.*)$/;

export function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  const match = markdown.match(FRONTMATTER);
  if (!match) return { frontmatter: "", body: markdown };
  return { frontmatter: match[0], body: markdown.slice(match[0].length) };
}

export function joinFrontmatter(frontmatter: string, body: string): string {
  if (!frontmatter) return body;
  const head = frontmatter.endsWith("\n") ? frontmatter : `${frontmatter}\n`;
  const rest = body.replace(/^(?:\r?\n)+/, "");
  return rest ? `${head}\n${rest}` : head;
}

function cleanTag(raw: string): string {
  return raw.trim().replace(/^(["'])(.*)\1$/, "$2").trim().replace(/^#/, "");
}

/** where the tags key sits in the frontmatter's lines, and what it holds */
function findTags(lines: readonly string[]) {
  const start = lines.findIndex((line) => TAG_KEY.test(line));
  if (start === -1) return null;
  const inline = lines[start].match(TAG_KEY)?.[1]?.trim() ?? "";
  let end = start + 1;
  const values: string[] = [];
  if (inline) {
    values.push(...inline.replace(/^\[|\]$/g, "").split(","));
  } else {
    for (; end < lines.length; end += 1) {
      const item = lines[end].match(LIST_ITEM);
      if (!item) break;
      values.push(item[1] ?? item[2] ?? "");
    }
  }
  const tags = [...new Set(values.map(cleanTag).filter(Boolean))];
  return { start, end, tags };
}

function frontmatterLines(frontmatter: string): string[] {
  const inner = frontmatter.match(FRONTMATTER)?.[1];
  return inner ? inner.split(/\r?\n/) : [];
}

export function readTags(markdown?: string | null): string[] {
  if (!markdown) return [];
  return findTags(frontmatterLines(splitFrontmatter(markdown).frontmatter))?.tags ?? [];
}

// YAML needs quotes around anything beyond plain word characters
const yamlTag = (tag: string) => (/^[\p{L}\p{N}_/-]+$/u.test(tag) ? tag : JSON.stringify(tag));

export function setTags(markdown: string, tags: readonly string[]): string {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const lines = frontmatterLines(frontmatter);
  const found = findTags(lines);
  const block = tags.length ? ["tags:", ...tags.map((tag) => `  - ${yamlTag(tag)}`)] : [];
  const next = found
    ? [...lines.slice(0, found.start), ...block, ...lines.slice(found.end)]
    : [...lines, ...block];
  if (next.length === 0) return frontmatter ? body.replace(/^(?:\r?\n)+/, "") : markdown;
  return joinFrontmatter(`---\n${next.join("\n")}\n---\n`, body);
}

export function addTag(markdown: string, tag: string): string {
  const tags = readTags(markdown);
  return tags.includes(tag) ? markdown : setTags(markdown, [...tags, tag]);
}

export function removeTag(markdown: string, tag: string): string {
  const tags = readTags(markdown);
  return tags.includes(tag) ? setTags(markdown, tags.filter((existing) => existing !== tag)) : markdown;
}
