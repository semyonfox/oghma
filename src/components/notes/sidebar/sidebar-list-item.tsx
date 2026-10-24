// extracted from Notea (MIT License)
// rewritten for App Router + Tailwind (no MUI); now only renders Favorites rows
import { NoteModel } from "@/lib/notes/types/note";
import Link from "next/link";
import React, { FC } from "react";
import { useRouter, usePathname } from "next/navigation";
import IconButton from "@/components/icon-button";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useSyncStatusStore from "@/lib/notes/state/sync-status";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useLayoutStore from "@/lib/notes/state/layout";
import { buildFileSpec } from "@/lib/notes/utils/file-spec";

const TextSkeleton = () => (
  <span className="inline-block w-20 h-4 bg-surface-elevated rounded-radius-sm animate-pulse" />
);

const SidebarListItem: FC<{
  item: NoteModel;
  onToggle: () => void;
  isExpanded: boolean;
  hasChildren: boolean;
}> = ({ item, onToggle, isExpanded, hasChildren }) => {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const initLoaded = useNoteTreeStore((state) => state.initLoaded);
  const setPaneA = useLayoutStore((state) => state.setPaneA);
  const setActivePane = useLayoutStore((state) => state.setActivePane);
  const syncStatus = useSyncStatusStore((s) => s.status[item.id]);

  const activeId = pathname?.startsWith("/notes/")
    ? pathname.split("/")[2] || null
    : null;
  const isActive = activeId === item.id;
  const isFolder = item.isFolder === true || hasChildren;
  const linkHref = isFolder ? "#" : `/notes/${item.id}`;

  const handleClickIcon = (e: Pick<React.SyntheticEvent, "preventDefault" | "stopPropagation">) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle();
  };

  const handleClickItem = (e: React.MouseEvent) => {
    // folders toggle; files navigate through the Link
    if (isFolder) {
      e.preventDefault();
      onToggle();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!isFolder) {
      e.preventDefault();
      setPaneA(buildFileSpec(item));
      setActivePane("A");
      router.push(linkHref);
    }
  };

  const emojiMatch = item.title?.match(/\p{Emoji}/u);
  const emoji = emojiMatch?.length === 1 ? emojiMatch[0] : undefined;

  return (
    <>
      <div
        className={`flex items-center pr-2 overflow-hidden text-text-tertiary hover:text-text-secondary hover:bg-subtle transition-colors duration-200 rounded-radius-sm px-2 py-1.5 cursor-pointer group ${
          isActive ? "bg-primary-500/10 text-primary-400" : ""
        }`}
        role="treeitem"
        aria-expanded={isFolder ? isExpanded : undefined}
        aria-selected={isActive}
        aria-current={isActive ? "page" : undefined}
      >
        <Link
          href={linkHref}
          className="flex flex-1 items-center truncate"
          onClick={handleClickItem}
          onDoubleClick={handleDoubleClick}
          aria-label={item.title || t("Untitled")}
        >
          {isFolder ? (
            emoji ? (
              <span
                onClick={handleClickIcon}
                className="flex-shrink-0 block p-0.5 cursor-pointer w-6 h-6 rounded-radius-sm mr-1 text-center hover:bg-subtle transition-colors"
                role="button"
                tabIndex={0}
                aria-label={isExpanded ? t("Collapse") : t("Expand")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleClickIcon(e);
                  }
                }}
              >
                {emoji}
              </span>
            ) : (
              <IconButton
                className="flex-shrink-0 w-4 h-4 mr-1 transition-transform transform"
                icon="ChevronRight"
                iconClassName={`${isExpanded ? "rotate-90" : ""}`}
                onClick={handleClickIcon}
                aria-label={isExpanded ? t("Collapse") : t("Expand")}
              ></IconButton>
            )
          ) : (
            <IconButton
              className="flex-shrink-0 w-4 h-4 mr-1"
              icon={item.title ? "DocumentText" : "Document"}
              aria-label={t("Document")}
              onClick={(e) => e.preventDefault()}
            ></IconButton>
          )}

          <span
            className={`flex-1 truncate text-sm ${
              syncStatus === "modified"
                ? "text-amber-400"
                : syncStatus === "new"
                  ? "text-green-400"
                  : ""
            }`}
            dir="auto"
          >
            {(emoji
              ? item.title.replace(emoji, "").trimStart()
              : item.title) ||
              (initLoaded ? t("Untitled") : <TextSkeleton />)}
            {syncStatus === "modified" && (
              <span
                className="ml-1 text-amber-400 text-xs"
                title={t("Modified")}
              >
                M
              </span>
            )}
            {syncStatus === "new" && (
              <span className="ml-1 text-green-400 text-xs" title={t("New")}>
                U
              </span>
            )}
          </span>
        </Link>
      </div>

      {isFolder && !hasChildren && isExpanded && (
        <div className="py-1.5 text-text-tertiary select-none">
          {initLoaded ? t("No notes inside") : <TextSkeleton />}
        </div>
      )}
    </>
  );
};

export default SidebarListItem;
