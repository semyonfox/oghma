"use client";

import NotesProviders from "@/components/notes/providers";
import NotesWorkspace from "@/components/notes/notes-workspace";

/**
 * Full notes workspace.
 * Features:
 * - Icon navigation (left)
 * - File tree (collapsible sections)
 * - Split editor pane (2-file editing)
 * - Right panel with tabs (Todo, Chat, Links, Properties)
 */
function NotesPage() {
  return (
    <NotesProviders>
      <NotesWorkspace />
    </NotesProviders>
  );
}

export default NotesPage;
