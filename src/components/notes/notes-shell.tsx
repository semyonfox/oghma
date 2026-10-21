"use client";

import { usePathname } from "next/navigation";
import NotesProviders from "@/components/notes/notes-providers";
import NotesWorkspace from "@/components/notes/notes-workspace";

// rendered from the notes layout, not the pages, so moving between notes
// keeps the tree, panes and their scroll positions mounted. as a page it was
// keyed by the [id] segment and remounted on every note change
export default function NotesShell() {
  const pathname = usePathname();
  return (
    <NotesProviders>
      <NotesWorkspace view={pathname === "/notes/trash" ? "trash" : "notes"} />
    </NotesProviders>
  );
}
