"use client";

import NotesProviders from "@/components/notes/notes-providers";
import NotesWorkspace from "@/components/notes/notes-workspace";

export default function TrashRoutePage() {
  return (
    <NotesProviders>
      <NotesWorkspace view="trash" />
    </NotesProviders>
  );
}
