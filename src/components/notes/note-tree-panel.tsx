"use client";

import { TrashIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FC, useCallback, useEffect, useRef, useState } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import SidebarList from "@/components/notes/sidebar/sidebar-list";

interface NoteTreePanelProps {
  onOpenNote?: () => void;
}

const NoteTreePanel: FC<NoteTreePanelProps> = ({ onOpenNote }) => {
  const { t } = useI18n();
  const pathname = usePathname();
  const isTrash = pathname === "/notes/trash";
  const [trashCount, setTrashCount] = useState(0);
  const isMountedRef = useRef(false);
  const requestControllerRef = useRef<AbortController | null>(null);

  const refreshTrashCount = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      const response = await fetch("/api/trash", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Failed to load Trash: ${response.status}`);

      const data = (await response.json()) as { items?: unknown };
      const count = Array.isArray(data.items) ? data.items.length : 0;

      if (!controller.signal.aborted && isMountedRef.current) {
        setTrashCount(count);
      }
    } catch {
      if (!controller.signal.aborted && isMountedRef.current) {
        setTrashCount(0);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void refreshTrashCount();

    const handleTrashChanged = () => void refreshTrashCount();
    window.addEventListener("notes:trash-changed", handleTrashChanged);

    return () => {
      isMountedRef.current = false;
      requestControllerRef.current?.abort();
      window.removeEventListener("notes:trash-changed", handleTrashChanged);
    };
  }, [refreshTrashCount]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="obsidian-scrollbar flex-1 overflow-y-auto overflow-x-hidden">
        <SidebarList onOpenNote={onOpenNote} />
      </div>
      <div className="shrink-0 p-2">
        <Link
          href="/notes/trash"
          onClick={() => onOpenNote?.()}
          aria-current={isTrash ? "page" : undefined}
          aria-label={trashCount > 0 ? `${t("Trash")} (${trashCount})` : undefined}
          className={`flex min-h-11 items-center gap-2 rounded-radius-md px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 ${
            isTrash
              ? "bg-primary-500/10 text-primary-300"
              : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
          }`}
        >
          <TrashIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("Trash")}</span>
          {trashCount > 0 && (
            <span
              className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-radius-sm bg-subtle px-1.5 py-0.5 text-xs font-medium tabular-nums text-text-tertiary"
              aria-hidden="true"
            >
              {trashCount}
            </span>
          )}
        </Link>
      </div>
    </div>
  );
};

export default NoteTreePanel;
