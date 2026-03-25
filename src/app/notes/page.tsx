'use client';

import NotesProviders from '@/components/notes/providers';
import VSCodeLayout from '@/components/layout/vscode-layout';

/**
 * Notes page with VSCode-style layout
 * Features:
 * - Icon navigation (left)
 * - File tree (collapsible sections)
 * - Split editor pane (2-file editing)
 * - Right panel with tabs (Todo, Chat, Links, Properties)
 */
function NotesPage() {
  return (
    <NotesProviders>
      <VSCodeLayout />
    </NotesProviders>
  );
}

export default NotesPage;
