import markdownLinkExtractor from "markdown-link-extractor";

// Accept any RFC 4122 version so links to pre-v7 notes remain usable.
const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

const INTERNAL_NOTE_LINK = new RegExp(
  `^/notes/(${UUID_PATTERN})(?:[?#].*)?$`,
  "i",
);

export function buildInternalNoteHref(noteId: string): string {
  return `/notes/${noteId}`;
}

export function parseInternalNoteHref(href: string | undefined | null) {
  if (!href) return null;
  const match = INTERNAL_NOTE_LINK.exec(href.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

export function extractInternalNoteIds(content: string): string[] {
  const links = markdownLinkExtractor(content, false);
  if (!Array.isArray(links)) return [];

  return [
    ...new Set(
      links
        .map((href) => parseInternalNoteHref(href))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}
