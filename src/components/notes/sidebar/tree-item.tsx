import React, { memo, useEffect, useRef, useState } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { NoteModel } from "@/lib/notes/types/note";
import useSyncStatusStore from "@/lib/notes/state/sync-status";
import {
  ArrowPathIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  EllipsisHorizontalIcon,
} from "@heroicons/react/24/outline";

const INDENT_PX = 14;

export interface TreeItemProps {
  itemId: string;
  nodeData: NoteModel | undefined;
  isFolder: boolean;
  isExpanded: boolean;
  isActive: boolean;
  isSelected: boolean;
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
  onClick: (e: React.MouseEvent) => void;
  onRenameComplete: (newTitle: string) => void | Promise<void>;
  onDotsClick: (e: React.MouseEvent) => void;
}

const TreeItem: React.FC<TreeItemProps> = memo(
  ({
    itemId,
    nodeData,
    isFolder,
    isExpanded,
    isActive,
    isSelected,
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
    onDotsClick,
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
            group/item mb-0.5 flex h-11 items-center pr-1 cursor-pointer select-none md:h-[26px]
            transition-colors duration-75 rounded-radius-sm mx-0.5
            ${isActive ? "bg-subtle text-text-secondary" : ""}
            ${
              !isActive && isSelected
                ? "bg-primary-500/10 text-text-secondary"
                : ""
            }
            ${
              !isActive && !isSelected
                ? "text-text-tertiary hover:text-text-secondary hover:bg-subtle"
                : ""
            }
            ${isActive && isSelected ? "ring-1 ring-primary-500/20" : ""}
            ${isDragging ? "opacity-40" : ""}
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
              <ArrowPathIcon
                className="h-3 w-3 animate-spin text-text-tertiary"
                aria-hidden="true"
              />
            ) : isFolder ? (
              <ChevronRightIcon
                className={`h-3 w-3 text-text-tertiary transition-transform duration-100 ${isExpanded ? "rotate-90" : ""}`}
                aria-hidden="true"
              />
            ) : (
              <DocumentTextIcon
                className="h-3.5 w-3.5 text-text-tertiary"
                aria-hidden="true"
              />
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
                className="flex-1 min-w-0 truncate bg-subtle border border-primary-500/50 rounded-radius-sm px-1 py-0 outline-none text-text-secondary text-[13px] leading-tight"
              />
            </div>
          ) : (
            <span
              className={`flex-1 min-w-0 truncate text-[13px] leading-snug ${
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
            <span className="flex-shrink-0 ml-0.5">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-radius-sm text-text-tertiary transition-[color,background-color,opacity] hover:bg-subtle hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500/50 md:h-5 md:w-5 md:opacity-0 md:group-hover/item:opacity-100 md:group-focus-within/item:opacity-100"
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
            className="h-6 flex items-center text-xs text-text-tertiary/50 select-none italic"
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
