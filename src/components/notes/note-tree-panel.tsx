"use client";

import { FC } from "react";
import SidebarList from "@/components/notes/sidebar/sidebar-list";

interface NoteTreePanelProps {
  onOpenNote?: () => void;
}

const NoteTreePanel: FC<NoteTreePanelProps> = ({ onOpenNote }) => {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="obsidian-scrollbar flex-1 overflow-y-auto overflow-x-hidden">
        <SidebarList onOpenNote={onOpenNote} />
      </div>
    </div>
  );
};

export default NoteTreePanel;
