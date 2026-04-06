import React, { memo, useEffect, useRef, useState } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { NoteModel } from "@/lib/notes/types/note";
import useSyncStatusStore from "@/lib/notes/state/sync-status";

const INDENT_PX = 14;

export interface TreeItemProps {
  itemId: string;
  nodeData: NoteModel | undefined;
  isFolder: boolean;
  isExpanded: boolean;
  isActive: boolean;
  isDragging: boolean;
  isLoading: boolean;
  hasChildren: boolean;
  depth: number;
  isRenaming: boolean;
  context: any;
  children: React.ReactNode;
  initLoaded: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggle: () => void;
  onClick: () => void;
  onRenameComplete: (newTitle: string) => void | Promise<void>;
  onAddNote: (e: React.MouseEvent) => void | Promise<void>;
  onDotsClick: (e: React.MouseEvent) => void;
  onOpenInAIChat: (e: React.MouseEvent) => void;
}

const TreeItem: React.FC<TreeItemProps> = memo(
  ({
    itemId,
    nodeData,
    isFolder,
    isExpanded,
    isActive,
    isDragging,
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
    onAddNote,
    onDotsClick,
    onOpenInAIChat,
  }) => {
    const { t } = useI18n();
    const syncStatus = useSyncStatusStore((s) => s.status[itemId]);
    const [renameValue, setRenameValue] = useState(nodeData?.title ?? "");
    const renameValueRef = useRef(renameValue);
    const renameInputRef = useRef<HTMLInputElement>(null);
    const escapedRef = useRef(false);
    const committedRef = useRef(false);
    const pl = depth * INDENT_PX;

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
      void onRenameComplete(trimmed || nodeData?.title || "Untitled");
    };

    const handleRenameCancel = () => {
      if (committedRef.current) return;
      committedRef.current = true;
      escapedRef.current = true;
      setRenameValue(nodeData?.title ?? "");
      void onRenameComplete(nodeData?.title ?? "Untitled");
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
          void onRenameComplete(original || "Untitled");
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
            group/item flex items-center h-[26px] pr-1 cursor-pointer select-none
            transition-colors duration-75 rounded-[3px] mx-0.5
            ${
              isActive
                ? "bg-subtle text-text-secondary"
                : "text-text-tertiary hover:text-text-secondary hover:bg-subtle"
            }
            ${isDragging ? "opacity-40" : ""}
          `}
          style={{ paddingLeft: `${pl + 4}px` }}
          draggable={true}
          onContextMenu={onContextMenu}
          onClick={(e) => {
            interactiveProps.onClick?.(e);
            onClick();
          }}
          onDragStart={(e: React.DragEvent) => {
            rctProps.onDragStart?.(e);
            interactiveProps.onDragStart?.(e);
          }}
        >
          <span
            className="flex-shrink-0 flex items-center justify-center w-4 h-4 mr-0.5"
            onClick={(e) => {
              if (isFolder) {
                e.preventDefault();
                e.stopPropagation();
                onToggle();
              }
            }}
          >
            {isLoading ? (
              <svg
                className="w-3 h-3 animate-spin text-text-tertiary"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : isFolder ? (
              <svg
                className={`w-[10px] h-[10px] text-text-tertiary transition-transform duration-100 ${isExpanded ? "rotate-90" : ""}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 4.707a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                className="w-1 h-1 text-text-tertiary/50"
                viewBox="0 0 6 6"
                fill="currentColor"
              >
                <circle cx="3" cy="3" r="2.5" />
              </svg>
            )}
          </span>

          {isRenaming ? (
            <div onKeyDownCapture={(e) => e.stopPropagation()}>
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
                className="flex-1 min-w-0 truncate bg-subtle border border-primary-500/50 rounded px-1 py-0 outline-none text-text-secondary text-[13px] leading-tight"
              />
            </div>
          ) : (
            <span
              className={`flex-1 min-w-0 truncate text-[13px] leading-none ${
                isFolder ? "font-medium" : ""
              } ${
                syncStatus === "modified"
                  ? "text-amber-400"
                  : syncStatus === "new"
                    ? "text-green-400"
                    : ""
              }`}
            >
              {nodeData?.title || (initLoaded ? t("Untitled") : "...")}
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
            <span className="flex-shrink-0 flex items-center gap-0 ml-0.5">
              <button
                className="p-0.5 rounded hover:bg-subtle text-text-tertiary hover:text-text-secondary transition-colors"
                onClick={onDotsClick}
                title={t("More actions")}
                tabIndex={-1}
              >
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                </svg>
              </button>
              <button
                className="p-0.5 rounded hover:bg-primary-600/20 text-text-tertiary hover:text-primary-300 transition-colors"
                onClick={onOpenInAIChat}
                title={isFolder ? t("Chat with folder") : t("Chat with note")}
                tabIndex={-1}
              >
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="7" y="7" width="10" height="10" rx="1" />
                  <path d="M9 4v3M12 4v3M15 4v3M9 17v3M12 17v3M15 17v3M4 9h3M4 12h3M4 15h3M17 9h3M17 12h3M17 15h3" />
                </svg>
              </button>
              {isFolder && (
                <button
                  className="p-0.5 rounded hover:bg-subtle text-text-tertiary hover:text-text-secondary transition-colors"
                  onClick={onAddNote}
                  title={t("New note inside")}
                  tabIndex={-1}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
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
            className="h-6 flex items-center text-[11px] text-text-tertiary/50 select-none italic"
            style={{ paddingLeft: `${pl + INDENT_PX + 8}px` }}
          >
            {t("No pages inside")}
          </div>
        )}
      </div>
    );
  },
);

TreeItem.displayName = "TreeItem";

export default TreeItem;
