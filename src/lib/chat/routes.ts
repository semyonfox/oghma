export interface ChatRouteContextItem {
  id: string;
  title: string;
}

interface ChatRouteContext {
  noteId?: string;
  noteTitle?: string;
  folderId?: string;
  folderTitle?: string;
  selectedNotes?: ChatRouteContextItem[];
  selectedFolders?: ChatRouteContextItem[];
}

function buildChatSearchParams({
  noteId,
  noteTitle,
  folderId,
  folderTitle,
  selectedNotes = [],
  selectedFolders = [],
}: ChatRouteContext): URLSearchParams {
  const params = new URLSearchParams();

  if (selectedNotes.length > 0 || selectedFolders.length > 0) {
    for (const note of selectedNotes) {
      params.append("noteId", note.id);
      params.append("noteTitle", note.title);
    }

    for (const folder of selectedFolders) {
      params.append("folderId", folder.id);
      params.append("folderTitle", folder.title);
    }

    return params;
  }

  if (noteId) {
    params.append("noteId", noteId);
    params.append("noteTitle", noteTitle ?? "Untitled");
  }

  if (folderId) {
    params.append("folderId", folderId);
    params.append("folderTitle", folderTitle ?? "Folder");
  }

  return params;
}

export function buildNewChatHref(context: ChatRouteContext = {}): string {
  const params = buildChatSearchParams(context);
  const query = params.toString();
  return query ? `/chat?${query}` : "/chat";
}

export function buildChatSessionHref(
  sessionId: string,
  context: ChatRouteContext = {},
): string {
  const params = buildChatSearchParams(context);
  const query = params.toString();
  return query ? `/chat/${sessionId}?${query}` : `/chat/${sessionId}`;
}
