"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { treeAPI } from "@/lib/notes/api/tree";
import { buildNewChatHref } from "@/lib/chat/routes";
import { splitModuleCode } from "@/lib/notes/module-code";

interface Course {
  id: string;
  title: string;
}

// the chat header chip from the Atlas mockup: shows which course the chat is
// scoped to and starts a new chat scoped to another top-level folder
export default function CourseScopeMenu({ current }: { current?: Course }) {
  const { t } = useI18n();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    treeAPI
      .fetchChildren(null, controller.signal)
      .then((result) => {
        const folders = (result?.items ?? [])
          .filter((item) => item.isFolder)
          .map((item) => ({ id: item.id, title: item.title || t("Untitled") }));
        setCourses(folders);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [t]);

  const label = current ? splitModuleCode(current.title) : null;

  return (
    <Menu as="div" className="relative">
      <MenuButton className="flex h-8 max-w-[18rem] items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[13px] text-text-secondary transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
        {label?.code && (
          <span className="rounded bg-accent-soft px-1 font-mono text-[11px] text-accent-soft-text">
            {label.code}
          </span>
        )}
        <span className="truncate">{label ? label.title : t("All notes")}</span>
        <ChevronDownIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        className="z-50 mt-1 max-h-80 w-72 overflow-y-auto rounded-radius-lg border border-border bg-surface-elevated p-1 shadow-float focus:outline-none"
      >
        <MenuItem>
          <button
            type="button"
            onClick={() => router.push(buildNewChatHref())}
            className="flex w-full items-center rounded-radius-md px-2.5 py-2 text-left text-sm text-text data-focus:bg-subtle"
          >
            {t("All notes")}
          </button>
        </MenuItem>
        {courses.map((course) => {
          const split = splitModuleCode(course.title);
          return (
            <MenuItem key={course.id}>
              <button
                type="button"
                onClick={() =>
                  router.push(buildNewChatHref({ folderId: course.id, folderTitle: course.title }))
                }
                className="flex w-full items-center gap-2 rounded-radius-md px-2.5 py-2 text-left text-sm text-text data-focus:bg-subtle"
              >
                {split.code && (
                  <span className="w-12 shrink-0 font-mono text-[11px] text-text-tertiary">{split.code}</span>
                )}
                <span className="truncate">{split.title}</span>
              </button>
            </MenuItem>
          );
        })}
      </MenuItems>
    </Menu>
  );
}
