const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NoteRouteResolution =
  | { type: "ignore" }
  | { type: "redirect"; noteId: string }
  | { type: "load"; noteId: string };

export function resolveNoteRoute(
  pathname: string | null | undefined,
): NoteRouteResolution {
  if (!pathname || !pathname.startsWith("/notes/")) {
    return { type: "ignore" };
  }

  const noteId = pathname.slice("/notes/".length).split("/")[0];
  if (!noteId) {
    return { type: "ignore" };
  }

  if (!UUID_RE.test(noteId)) {
    return { type: "redirect", noteId };
  }

  return { type: "load", noteId };
}
