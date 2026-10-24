import React, { useEffect, useRef, useState } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { NoteModel } from "@/lib/notes/types/note";
import useSyncStatusStore from "@/lib/notes/state/sync-status";
import {
  buildFileSpec,
  FILE_DRAG_MIME,
  inferFileType,
} from "@/lib/notes/utils/file-spec";
import {
  ArrowPathIcon,
  ChevronRightIcon,
  CodeBracketIcon,
  DocumentIcon,
  DocumentTextIcon,
  EllipsisHorizontalIcon,
  FilmIcon,
  FolderIcon,
  FolderOpenIcon,
  PaperClipIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import type { FileType } from "@/lib/notes/state/layout";
import type { TreeItemRenderContext } from "react-complex-tree";

const INDENT_PX = 14;

const FILE_ICONS: Record<FileType, { Icon: typeof DocumentIcon; className: string }> = {
  note: { Icon: DocumentTextIcon, className: "text-text-tertiary" },
  pdf: { Icon: DocumentIcon, className: "text-red-400" },
  image: { Icon: PhotoIcon, className: "text-emerald-500 dark:text-emerald-400" },
  video: { Icon: FilmIcon, className: "text-violet-500 dark:text-violet-400" },
  text: { Icon: CodeBracketIcon, className: "text-sky-500 dark:text-sky-400" },
  attachment: { Icon: PaperClipIcon, className: "text-text-tertiary" },
};

// notes drop their .md, other files keep a muted extension so a PDF and the
// note extracted from it don't read as the same line twice
function splitDisplayTitle(title: string, fileType: FileType | null) {
  if (!fileType) return { name: title, extension: "" };
  const match = /^(.+?)(\.[a-z0-9]{1,8})$/i.exec(title);
  if (!match) return { name: title, extension: "" };
  if (fileType === "note") {
    return match[2].toLowerCase() === ".md"
      ? { name: match[1], extension: "" }
      : { name: title, extension: "" };
  }
  return { name: match[1], extension: match[2] };
}

interface TreeItemProps {
  itemId: string;
  nodeData: NoteModel | undefined;
  isFolder: boolean;
  isExpanded: boolean;
  isActive: boolean;
  isSelected: boolean;
  isDragging: boolean;
  isDraggingOver: boolean;
  isLoading: boolean;
  hasChildren: boolean;
  depth: number;
  isRenaming: boolean;
  context: TreeItemRenderContext;
  children: React.ReactNode;
  initLoaded: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggle: () => void;
  onClick: (e: React.MouseEvent) => void;
  onRenameComplete: (newTitle: string) => void | Promise<void>;
  onDotsClick: (e: React.MouseEvent) => void;
}

function TreeItem({
  itemId,
  nodeData,
  isFolder,
  isExpanded,
  isActive,
  isSelected,
  isDragging,
  isDraggingOver,
  isLoading,
  hasChildren,
  depth,
  isRenaming,
  context,
  children,
  initLoaded,
  onContextMenu,
  onToggle,
  onClick,
  onRenameComplete,
  onDotsClick,
}: TreeItemProps) {
  const { t } = useI18n();
  const syncStatus = useSyncStatusStore((s) => s.status[itemId]);
  const [renameValue, setRenameValue] = useState(nodeData?.title ?? "");
  const renameValueRef = useRef(renameValue);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const escapedRef = useRef(false);
  const committedRef = useRef(false);
  const pl = depth * INDENT_PX;
  const bundle = isFolder ? nodeData?.bundle : undefined;
  const fileType = isFolder
    ? null
    : inferFileType(nodeData?.title, nodeData?.mimeType, nodeData?.s3Key);
  const displayTitle = splitDisplayTitle(
    nodeData?.title || (initLoaded ? t("Untitled") : "..."),
    fileType,
  );
  const { Icon: RowIcon, className: rowIconClass } = bundle
    ? FILE_ICONS.pdf
    : isFolder
      ? { Icon: isExpanded ? FolderOpenIcon : FolderIcon, className: "text-text-tertiary" }
      : FILE_ICONS[fileType ?? "note"];

  useEffect(() => {
    renameValueRef.current = renameValue;
  }, [renameValue]);

  useEffect(() => {
    if (isRenaming) {
      escapedRef.current = false;
      committedRef.current = false;
      requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    }
  }, [isRenaming]);

  useEffect(() => {
    if (!isRenaming) {
      requestAnimationFrame(() => setRenameValue(nodeData?.title ?? ""));
    }
  }, [nodeData?.title, isRenaming]);

  const handleRenameSubmit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = renameValueRef.current.trim();
    void onRenameComplete(trimmed || nodeData?.title || t("Untitled"));
  };

  const handleRenameCancel = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    escapedRef.current = true;
    setRenameValue(nodeData?.title ?? "");
    void onRenameComplete(nodeData?.title ?? t("Untitled"));
  };

  const handleRenameBlur = () => {
    if (escapedRef.current) return;
    setTimeout(() => {
      if (escapedRef.current || committedRef.current) return;
      const trimmed = renameValueRef.current.trim();
      const original = nodeData?.title ?? "";
      if (trimmed && trimmed !== original) {
        handleRenameSubmit();
      } else {
        void onRenameComplete(original || t("Untitled"));
      }
    }, 150);
  };

  const rctProps = context.itemContainerWithoutChildrenProps ?? {};
  const interactiveProps = context.interactiveElementProps ?? {};

  return (
    <div className="flex flex-col w-full">
      <div
        {...rctProps}
        {...(isRenaming ? {} : interactiveProps)}
        className={`
          group/item mb-0.5 flex min-h-12 items-center pr-1 cursor-pointer select-none md:min-h-7
          transition-colors duration-75 rounded-radius-sm mx-0.5
          ${isActive ? "bg-subtle text-text-secondary" : ""}
          ${
            !isActive && isSelected
              ? "bg-primary-500/10 text-text-secondary"
              : ""
          }
          ${
            !isActive && !isSelected
              ? "text-text-secondary hover:text-text hover:bg-subtle"
              : ""
          }
          ${isActive && isSelected ? "ring-1 ring-primary-500/20" : ""}
          ${isDragging ? "opacity-40" : ""}
          ${isDraggingOver ? "bg-primary-500/20 text-text-secondary ring-2 ring-inset ring-primary-400/70 shadow-[inset_3px_0_0_rgb(96_165_250)]" : ""}
        `}
        style={{ paddingLeft: `${pl + 4}px` }}
        draggable={true}
        onContextMenu={onContextMenu}
        onClick={(e) => {
          interactiveProps.onClick?.(e);
          onClick(e);
        }}
        onDragStart={(e: React.DragEvent) => {
          rctProps.onDragStart?.(e);
          interactiveProps.onDragStart?.(e);
          if (!isFolder && nodeData) {
            e.dataTransfer.setData(
              FILE_DRAG_MIME,
              JSON.stringify({ file: buildFileSpec(nodeData) }),
            );
          }
        }}
      >
        <span
          className="flex h-11 w-6 shrink-0 items-center justify-center md:h-5 md:w-4"
          onClick={(e) => {
            if (isFolder) {
              e.preventDefault();
              e.stopPropagation();
              onToggle();
            }
          }}
        >
          {isLoading ? (
            <ArrowPathIcon
              className="h-3 w-3 animate-spin text-text-tertiary"
              aria-hidden="true"
            />
          ) : isFolder ? (
            <ChevronRightIcon
              className={`h-3 w-3 text-text-tertiary transition-[transform,opacity] duration-100 ${isExpanded ? "rotate-90" : ""} ${
                bundle && !isExpanded
                  ? "md:opacity-0 md:group-hover/item:opacity-100 md:group-focus-within/item:opacity-100"
                  : ""
              }`}
              aria-hidden="true"
            />
          ) : null}
        </span>
        <RowIcon
          className={`mr-1.5 h-4 w-4 shrink-0 md:h-3.5 md:w-3.5 ${rowIconClass}`}
          aria-hidden="true"
        />

        {isRenaming ? (
          <div
            className="min-w-0 flex-1"
            onKeyDownCapture={(e) => e.stopPropagation()}
          >
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameBlur}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleRenameSubmit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  handleRenameCancel();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label={t("Rename")}
              className="w-full min-w-0 truncate bg-surface border border-primary-500/50 rounded-radius-sm px-1 py-1 outline-none text-text text-base md:py-0 md:text-[13px] leading-snug"
            />
          </div>
        ) : (
          <span
            title={nodeData?.title || t("Untitled")}
            className={`flex-1 min-w-0 truncate text-base md:text-[13px] leading-snug ${
              isFolder && !bundle ? "font-medium" : ""
            } ${
              syncStatus === "modified"
                ? "text-amber-700 dark:text-amber-400"
                : syncStatus === "new"
                  ? "text-green-700 dark:text-green-400"
                  : ""
            }`}
          >
            {displayTitle.name}
            {displayTitle.extension && (
              <span className="text-text-tertiary">{displayTitle.extension}</span>
            )}
          </span>
        )}

        {!isRenaming &&
          (syncStatus === "modified" || syncStatus === "new") && (
            <span
              className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ml-1 ${
                syncStatus === "modified" ? "bg-amber-400" : "bg-green-400"
              }`}
            />
          )}

        {!isRenaming && (
          <span className="flex-shrink-0 ml-0.5">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-radius-sm text-text-tertiary transition-[color,background-color,opacity] hover:bg-subtle hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 md:h-6 md:w-6 md:opacity-0 md:group-hover/item:opacity-100 md:group-focus-within/item:opacity-100 pointer-coarse:opacity-100"
              onClick={onDotsClick}
              title={t("More actions")}
              aria-label={t("More actions")}
            >
              <EllipsisHorizontalIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="relative">
          <div
            className="absolute top-0 bottom-0 w-px bg-primary-500/20 pointer-events-none"
            style={{ left: `${pl + 11}px` }}
          />
          {children}
        </div>
      )}
      {!hasChildren && children}

      {isFolder && isExpanded && !hasChildren && initLoaded && (
        <div
          className="min-h-8 flex items-center text-sm text-text-tertiary md:text-xs"
          style={{ paddingLeft: `${pl + INDENT_PX + 8}px` }}
        >
          {t("No pages inside")}
        </div>
      )}
    </div>
  );
}

export default TreeItem;
