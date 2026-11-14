"use client";

import { FC } from "react";
import SidebarList from "@/components/notes/sidebar/sidebar-list";

interface NoteTreePanelProps {
  onOpenNote?: () => void;
}

const NoteTreePanel: FC<NoteTreePanelProps> = ({ onOpenNote }) => (
  <div className="flex h-full flex-col overflow-hidden bg-sidebar">
    <div className="obsidian-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
      <SidebarList onOpenNote={onOpenNote} />
    </div>
  </div>
);

export default NoteTreePanel;
