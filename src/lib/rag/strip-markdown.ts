// strips markdown syntax while preserving the semantic content
// used before embedding to keep vectors clean (no ###, ---, **bold**, etc.)
// NOT for display — the raw markdown is kept in chunks.text and note content

export function stripMarkdown(md: string): string {
  return (
    md
      // code blocks (fenced) — keep the code content
      .replace(/```[\s\S]*?```/g, (m) => m.replace(/^```\w*\s*$/gm, "").trim())
      // inline code — keep content
      .replace(/`([^`]+)`/g, "$1")
      // headings — keep text
      .replace(/^#{1,6}\s+/gm, "")
      // horizontal rules
      .replace(/^-{3,}$/gm, "")
      .replace(/^\*{3,}$/gm, "")
      // bold/italic. markers must hug the text, so `2 * 3 * 4` survives, and
      // underscores only count at word edges so snake_case stays intact
      .replace(/(\*{1,3})(?=\S)([^*\n]+?)(?<=\S)\1/g, "$2")
      .replace(/(^|\W)(_{1,3})(?=\S)([^_\n]+?)(?<=\S)\2(?!\w)/gm, "$1$3")
      // strikethrough
      .replace(/~~([^~]+)~~/g, "$1")
      // images — keep alt text
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      // links — keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // blockquotes
      .replace(/^>\s?/gm, "")
      // unordered list markers
      .replace(/^[\s]*[-*+]\s+/gm, "")
      // ordered list markers
      .replace(/^[\s]*\d+\.\s+/gm, "")
      // HTML tags. a tag name must follow `<` directly so `x < 5 and y > 3`
      // is kept as text
      .replace(/<\/?[a-zA-Z][\w:-]*(?:\s[^<>]*)?\/?>/g, "")
      // collapse blank lines
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
