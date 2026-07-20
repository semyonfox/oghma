"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useContextMenuStore from "@/lib/notes/state/context-menu";
import {
  DocumentPlusIcon,
  FolderPlusIcon,
  PencilSquareIcon,
  Square2StackIcon,
  TrashIcon,
  ViewColumnsIcon,
} from "@heroicons/react/24/outline";

interface NoteContextMenuPortalProps {
  onRename: (id: string) => void;
  onDelete: (ids: string[]) => void;
  onDuplicate: (id: string) => void;
  onTogglePin: (id: string) => void;
  onCreateNote: (parentId: string) => void;
  onCreateFolder: (parentId: string) => void;
  onOpenInSplit: (id: string) => void;
}

// menu item component for consistency
const MenuItem = ({
  label,
  shortcut,
  icon,
  onClick,
  danger,
  className,
}: {
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  className?: string;
}) => (
  <button
    onClick={onClick}
    className={`w-full items-center h-11 md:h-7 px-2 text-[13px] rounded-[3px] mx-0.5 transition-colors ${
      className ?? "flex"
    } ${
      danger
        ? "text-error-400 hover:bg-error-500/10"
        : "text-text-secondary hover:bg-subtle"
    }`}
    style={{ width: "calc(100% - 4px)" }}
  >
    <span className="flex-shrink-0 w-4 h-4 mr-2.5 flex items-center justify-center opacity-70">
      {icon}
    </span>
    <span className="flex-1 text-left truncate">{label}</span>
    {shortcut && (
      <span className="text-xs text-text-tertiary ml-4 flex-shrink-0">
        {shortcut}
      </span>
    )}
  </button>
);

const Separator = ({ className = "" }: { className?: string }) => (
  <div className={`my-1 mx-2 border-t border-border-subtle ${className}`} />
);
export default function NoteContextMenuPortal({
  onRename,
  onDelete,
  onDuplicate,
  onTogglePin,
  onCreateNote,
  onCreateFolder,
  onOpenInSplit,
}: NoteContextMenuPortalProps) {
  const { t } = useI18n();
  const {
    openMenuId,
    position,
    isFolder,
    isPinned,
    selectedCount,
    selectionIds,
    closeMenu,
  } = useContextMenuStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjusted, setAdjusted] = useState<{ x: number; y: number } | null>(
    null,
  );

  // clamp menu position to viewport after it renders and we know its actual size
  useEffect(() => {
    if (!openMenuId) {
      requestAnimationFrame(() => setAdjusted(null));
      return;
    }
    // wait one frame for the menu to render and have dimensions
    const frame = requestAnimationFrame(() => {
      const el = menuRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pad = 8;
      let x = position.x;
      let y = position.y;
      if (x + rect.width > window.innerWidth - pad)
        x = Math.max(pad, window.innerWidth - rect.width - pad);
      if (y + rect.height > window.innerHeight - pad)
        y = Math.max(pad, window.innerHeight - rect.height - pad);
      if (x !== position.x || y !== position.y) setAdjusted({ x, y });
    });
    return () => cancelAnimationFrame(frame);
  }, [openMenuId, position]);
  // close on click outside or scroll
  useEffect(() => {
    if (!openMenuId) return;
    const handleClose = () => closeMenu();
    document.addEventListener("click", handleClose);
    document.addEventListener("scroll", handleClose, true);
    return () => {
      document.removeEventListener("click", handleClose);
      document.removeEventListener("scroll", handleClose, true);
    };
  }, [openMenuId, closeMenu]);

  // close on escape
  useEffect(() => {
    if (!openMenuId) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [openMenuId, closeMenu]);

  if (!openMenuId) return null;

  const run = (fn: () => void) => {
    fn();
    closeMenu();
  };
  const isMultiSelectMenu = selectedCount > 1;

  const icons = {
    pin: (
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path d="M11.5 3.5l5 5-3 3-1-1-4 4-2.5-2.5 4-4-1-1-3 3" />
        <path d="M6 14l-2.5 2.5" />
      </svg>
    ),
    rename: <PencilSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />,
    duplicate: <Square2StackIcon className="h-3.5 w-3.5" aria-hidden="true" />,
    newNote: <DocumentPlusIcon className="h-3.5 w-3.5" aria-hidden="true" />,
    newFolder: <FolderPlusIcon className="h-3.5 w-3.5" aria-hidden="true" />,
    split: <ViewColumnsIcon className="h-3.5 w-3.5" aria-hidden="true" />,
    trash: <TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />,
  };

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[180px] rounded-radius-md bg-surface/95 backdrop-blur-md py-1 shadow-2xl ring-1 ring-border-subtle"
      style={{
        top: `${(adjusted ?? position).y}px`,
        left: `${(adjusted ?? position).x}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {isMultiSelectMenu ? (
        <MenuItem
          label={t("Delete selected")}
          icon={icons.trash}
          onClick={() => run(() => onDelete(selectionIds))}
          danger
        />
      ) : (
        <>
          {!isFolder && (
            <MenuItem
              label={isPinned ? t("Unpin") : t("Pin to favorites")}
              icon={icons.pin}
              onClick={() => run(() => onTogglePin(openMenuId))}
            />
          )}

          <MenuItem
            label={t("Rename")}
            shortcut="F2"
            icon={icons.rename}
            onClick={() => run(() => onRename(openMenuId))}
          />

          {!isFolder && (
            <MenuItem
              label={t("Duplicate")}
              icon={icons.duplicate}
              onClick={() => run(() => onDuplicate(openMenuId))}
            />
          )}

          {(isFolder || openMenuId === "root") && (
            <>
              <Separator />
              <MenuItem
                label={t("New note")}
                icon={icons.newNote}
                onClick={() =>
                  run(() =>
                    onCreateNote(openMenuId === "root" ? "root" : openMenuId),
                  )
                }
              />
              <MenuItem
                label={t("New folder")}
                icon={icons.newFolder}
                onClick={() =>
                  run(() =>
                    onCreateFolder(
                      openMenuId === "root" ? "root" : openMenuId,
                    ),
                  )
                }
              />
            </>
          )}

          {!isFolder && (
            <>
              <Separator className="hidden md:block" />
              <MenuItem
                label={t("Open in split view")}
                icon={icons.split}
                onClick={() => run(() => onOpenInSplit(openMenuId))}
                className="hidden md:flex"
              />
            </>
          )}

          <Separator />

          <MenuItem
            label={t("Delete")}
            icon={icons.trash}
            onClick={() => run(() => onDelete([openMenuId]))}
            danger
          />
        </>
      )}
    </div>,
    document.body,
  );
}
