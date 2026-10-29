"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { AdjustmentsHorizontalIcon, ArrowPathIcon, CheckIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import type { TreeViewSettings } from "@/lib/notes/tree-view-settings";

const headingClass =
  "px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary";
const optionClass =
  "flex min-h-11 w-full items-center gap-2 rounded-radius-md px-2.5 text-left text-sm text-text-secondary hover:bg-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 md:min-h-8 md:text-[13px]";

function Option({
  checked,
  role,
  onClick,
  children,
  hint,
}: {
  checked: boolean;
  role: "menuitemradio" | "menuitemcheckbox";
  onClick: () => void;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <button type="button" role={role} aria-checked={checked} className={optionClass} onClick={onClick}>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint}
      <CheckIcon
        className={`h-4 w-4 shrink-0 text-primary-600 dark:text-primary-300 ${checked ? "" : "invisible"}`}
        aria-hidden="true"
      />
    </button>
  );
}

interface TreeViewMenuProps {
  view: TreeViewSettings;
  /** classified topics across the user's study maps, shown beside Tags while Folders is on */
  topicsReady: number;
  showHint: boolean;
  /** the tree keeps itself current, so a manual refresh lives here instead of in the header */
  refreshing: boolean;
  onRefresh: () => void;
  onChange: (patch: Partial<TreeViewSettings>) => void;
  onDismissHint: () => void;
}

const HINT_WIDTH = 256;

/** V2: a one-off pointer at the View button. it's portalled because the tree panel clips its overflow */
function ViewHint({ anchor, onDismiss }: { anchor: HTMLElement; onDismiss: () => void }) {
  const { t } = useI18n();
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    const measure = () => setRect(anchor.getBoundingClientRect());
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [anchor]);
  if (!rect) return null;
  const width = Math.min(HINT_WIDTH, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - 24, window.innerWidth - width - 8));
  return createPortal(
    <div
      role="dialog"
      aria-label={t("View")}
      className="fixed z-[55] rounded-radius-lg border border-primary-500/30 bg-surface p-3 text-sm shadow-lg"
      style={{ top: rect.bottom + 8, left, width }}
    >
      <span
        className="absolute -top-1.5 h-3 w-3 rotate-45 border-l border-t border-primary-500/30 bg-surface"
        style={{ left: rect.left + rect.width / 2 - left - 6 }}
        aria-hidden="true"
      />
      <p className="font-medium text-text">{t("Your files are in, as Canvas had them.")}</p>
      <p className="mt-1 text-text-secondary">
        {t("Once a study map sorts them into topics, switch to Tags here.")}
      </p>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 rounded-radius-md bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 md:min-h-8"
        >
          {t("Got it")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function TreeViewMenu({ view, topicsReady, showHint, refreshing, onRefresh, onChange, onDismissHint }: TreeViewMenuProps) {
  const { t } = useI18n();
  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null);
  const markOptions: Array<{ value: TreeViewSettings["marks"]; label: string }> = [
    { value: "dots", label: t("Dots") },
    { value: "badge", label: t("Icon badge") },
    { value: "off", label: t("Off") },
  ];

  return (
    <div ref={setWrapper} className="relative">
      <Popover>
        <PopoverButton
          className="ui-icon-button data-[open]:bg-subtle"
          title={t("View")}
          aria-label={t("View")}
          onClick={() => {
            if (showHint) onDismissHint();
          }}
        >
          <AdjustmentsHorizontalIcon className="h-[18px] w-[18px]" aria-hidden="true" />
        </PopoverButton>
        <PopoverPanel
          anchor="bottom end"
          role="menu"
          aria-label={t("View")}
          className="z-[60] w-64 max-w-[calc(100vw-1rem)] rounded-radius-lg border border-border-subtle bg-surface p-1 text-text shadow-lg [--anchor-gap:6px] [--anchor-padding:8px] focus:outline-none"
        >
          <div role="group" aria-label={t("Group by")}>
            <p className={headingClass}>{t("Group by")}</p>
            <Option role="menuitemradio" checked={view.group === "folders"} onClick={() => onChange({ group: "folders" })}>
              {t("Folders")}
            </Option>
            <Option
              role="menuitemradio"
              checked={view.group === "tags"}
              onClick={() => onChange({ group: "tags" })}
              hint={
                view.group === "folders" && topicsReady > 0 ? (
                  <span className="shrink-0 text-xs text-primary-700 dark:text-primary-300">
                    {t("{count} topics ready", { count: topicsReady })}
                  </span>
                ) : null
              }
            >
              {t("Tags")}
            </Option>
          </div>
          <div className="my-1 h-px bg-border-subtle" />
          <div role="group" aria-label={t("Show")}>
            <p className={headingClass}>{t("Show")}</p>
            <Option
              role="menuitemcheckbox"
              checked={view.hideFinished}
              onClick={() => onChange({ hideFinished: !view.hideFinished })}
            >
              {t("Hide finished courses")}
            </Option>
            <Option
              role="menuitemcheckbox"
              checked={view.showFiles}
              onClick={() => onChange({ showFiles: !view.showFiles })}
            >
              {t("Images and files")}
            </Option>
          </div>
          <div role="group" aria-label={t("Tag marks on rows")}>
            <p className={headingClass}>{t("Tag marks on rows")}</p>
            {markOptions.map((option) => (
              <Option
                key={option.value}
                role="menuitemradio"
                checked={view.marks === option.value}
                onClick={() => onChange({ marks: option.value })}
              >
                {option.label}
              </Option>
            ))}
          </div>
          <div className="my-1 h-px bg-border-subtle" />
          <div role="group" aria-label={t("Sort")}>
            <p className={headingClass}>{t("Sort")}</p>
            <Option role="menuitemradio" checked={view.sort === "name"} onClick={() => onChange({ sort: "name" })}>
              {t("Name")}
            </Option>
            <Option role="menuitemradio" checked={view.sort === "recent"} onClick={() => onChange({ sort: "recent" })}>
              {t("Recently edited")}
            </Option>
          </div>
          <div className="my-1 h-px bg-border-subtle" />
          <button
            type="button"
            role="menuitem"
            className={`${optionClass} disabled:opacity-50`}
            disabled={refreshing}
            aria-busy={refreshing}
            onClick={onRefresh}
          >
            <ArrowPathIcon className={`h-4 w-4 shrink-0 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{t("Refresh notes")}</span>
          </button>
        </PopoverPanel>
      </Popover>

      {showHint && wrapper && <ViewHint anchor={wrapper} onDismiss={onDismissHint} />}
    </div>
  );
}
