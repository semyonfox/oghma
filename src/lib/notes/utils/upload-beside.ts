import useNoteTreeStore from "@/lib/notes/state/tree";
import { publishWorkspaceInvalidation } from "@/lib/notes/workspace-invalidation";

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/**
 * Upload a file as its own note in the same folder as `besideNoteId`. The file
 * keeps the normal upload pipeline (extraction, search), and the caller links
 * to the returned note instead of embedding it.
 */
export async function uploadFileBeside(
  file: File,
  besideNoteId: string,
): Promise<{ noteId: string; title: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("besideNoteId", besideNoteId);

  const response = await fetch("/api/upload", { method: "POST", body: form });
  if (!response.ok) throw new Error(`upload failed: ${response.status}`);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("noteId" in data) || typeof data.noteId !== "string") {
    throw new Error("upload response did not include a note ID");
  }

  const { ownerUserId, refreshTree } = useNoteTreeStore.getState();
  if (ownerUserId) publishWorkspaceInvalidation(ownerUserId, "tree");
  void refreshTree().catch(() => {});
  return { noteId: data.noteId, title: file.name };
}
