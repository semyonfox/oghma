"use client";

import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { ArrowUpTrayIcon, DocumentPlusIcon, FolderPlusIcon, PlusIcon } from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";

const itemClass =
  "flex min-h-11 w-full items-center gap-2.5 rounded-radius-md px-2.5 text-left text-sm text-text-secondary hover:bg-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 md:min-h-8 md:text-[13px]";

/** one + for everything that makes something new, so the header keeps two icons */
export function NewMenu({
  onNewNote,
  onNewFolder,
  onUpload,
}: {
  onNewNote: () => void;
  onNewFolder: () => void;
  onUpload: () => void;
}) {
  const { t } = useI18n();
  const items: Array<{ label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; run: () => void }> = [
    { label: t("New note"), icon: DocumentPlusIcon, run: onNewNote },
    { label: t("New folder"), icon: FolderPlusIcon, run: onNewFolder },
    { label: t("Upload files"), icon: ArrowUpTrayIcon, run: onUpload },
  ];
  return (
    <Popover>
      <PopoverButton className="ui-icon-button data-[open]:bg-subtle" title={t("New")} aria-label={t("New")}>
        <PlusIcon className="h-[18px] w-[18px]" aria-hidden="true" />
      </PopoverButton>
      <PopoverPanel
        anchor="bottom end"
        role="menu"
        aria-label={t("New")}
        className="z-[60] w-48 rounded-radius-lg border border-border-subtle bg-surface p-1 text-text shadow-lg [--anchor-gap:6px] [--anchor-padding:8px] focus:outline-none"
      >
        {({ close }) => (
          <>
            {items.map(({ label, icon: Icon, run }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => {
                  close();
                  run();
                }}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </button>
            ))}
          </>
        )}
      </PopoverPanel>
    </Popover>
  );
}
