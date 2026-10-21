import useLayoutStore, { type FileSpec, type PaneId } from "@/lib/notes/state/layout";
import useNoteTreeStore from "@/lib/notes/state/tree";
import { buildFileSpec } from "@/lib/notes/utils/file-spec";

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Resolve a note id to the viewer it needs, from the tree when it is loaded. */
export async function resolveFileSpec(noteId: string): Promise<FileSpec | null> {
  const known = useNoteTreeStore.getState().tree.items[noteId]?.data;
  if (known) return buildFileSpec(known);

  try {
    const response = await fetch(
      `/api/notes/${encodeURIComponent(noteId)}?fields=id,title,s3Key,mimeType`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || !("id" in value)) return null;
    const id = optionalString(value.id);
    if (!id) return null;
    return buildFileSpec({
      id,
      title: "title" in value ? optionalString(value.title) : null,
      s3Key: "s3Key" in value ? optionalString(value.s3Key) : null,
      mimeType: "mimeType" in value ? optionalString(value.mimeType) : null,
    });
  } catch {
    return null;
  }
}

/**
 * Open a link from a note. Files (PDFs, images, video) open in the other pane
 * so reading them never closes the note being written; notes keep navigating.
 * Returns false when the caller should fall back to normal navigation.
 */
export async function openLinkedFileBeside(
  noteId: string,
  fromPane: PaneId,
): Promise<boolean> {
  const file = await resolveFileSpec(noteId);
  if (!file || file.fileType === "note") return false;
  const target: PaneId = fromPane === "A" ? "B" : "A";
  const { placeFileInPane, setActivePane } = useLayoutStore.getState();
  placeFileInPane(file, target);
  setActivePane(target);
  return true;
}
