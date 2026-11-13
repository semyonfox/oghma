export interface NoteSection {
  key: string;
  title: string;
  text: string;
}

// JSON keeps heading paths unambiguous even when a heading contains a slash
export function splitSections(markdown: string): NoteSection[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const sections: NoteSection[] = [];
  const path: { level: number; title: string }[] = [];
  let body: string[] = [];
  let fence: string | null = null;
  let headingPath: string[] = [];
  const flush = () => {
    const text = body.join("\n").trim();
    if (text) sections.push({
      key: JSON.stringify([headingPath, sections.length + 1]),
      title: headingPath.join(" / "),
      text,
    });
    body = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && /^ {0,3}(?:`+|~+)\s*$/.test(line)) fence = null;
      body.push(line);
      continue;
    }
    const atx = !fence ? line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/) : null;
    const setext = !fence && line.trim() && !/^\s*[-*>]/.test(line)
      ? lines[i + 1]?.match(/^ {0,3}(=+|-+)\s*$/) : null;
    if (atx || setext) {
      flush();
      const level = atx ? atx[1].length : setext![1][0] === "=" ? 1 : 2;
      const title = atx ? atx[2].trim() : line.trim();
      while (path.length && path[path.length - 1].level >= level) path.pop();
      path.push({ level, title });
      headingPath = path.map((part) => part.title);
      body.push(line);
      if (setext) body.push(lines[++i]);
    } else body.push(line);
  }
  flush();
  if (sections.some((section) => section.title)) return sections;
  const text = markdown.trim();
  const windows: NoteSection[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 1500, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf(" ", end);
      if (boundary > start + 1000) end = boundary;
    }
    const ordinal = windows.length + 1;
    windows.push({ key: JSON.stringify([[], ordinal]), title: "", text: text.slice(start, end).trim() });
    start = end;
  }
  return windows;
}

// The key is JSON, so a heading such as "TCP/IP" contains a slash. A path
// segment would split there, so the request carries the key as base64url.
export function encodeSectionKey(key: string): string {
  const bytes = new TextEncoder().encode(key);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeSectionKey(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
    const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
