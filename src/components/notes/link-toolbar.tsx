"use client";

// link toolbar - shows actions for external links on hover
// ported from Notea (MIT License) - MUI Paper replaced with Tailwind floating panel
import { FC } from "react";
import usePortalStore from "@/lib/notes/state/portal";
import {
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { useToast } from "@/lib/notes/hooks/use-toast";

const LinkToolbar: FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const { linkToolbar } = usePortalStore();

  if (!linkToolbar.visible || !linkToolbar.data?.href || !linkToolbar.anchor) {
    return null;
  }

  const rect = linkToolbar.anchor.getBoundingClientRect();
  const top = rect.bottom + 4;
  const left = Math.min(rect.left, window.innerWidth - 280);

  const handleOpen = () => {
    window.open(linkToolbar.data!.href, "_blank");
    linkToolbar.close();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(linkToolbar.data!.href);
      toast("Link copied", "success");
    } catch {
      toast("Failed to copy", "error");
    }
    linkToolbar.close();
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => linkToolbar.close()} />
      <div
        className="fixed z-50 bg-surface-elevated rounded-lg shadow-xl border border-border-subtle overflow-hidden"
        style={{ top, left }}
        onMouseLeave={() => linkToolbar.close()}
      >
        <div className="p-2 max-w-[280px]">
          <p className="text-xs text-text-tertiary truncate mb-2 px-1">
            {linkToolbar.data.href}
          </p>
          <div className="flex gap-1">
            <button
              onClick={handleOpen}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded text-sm text-text-tertiary hover:bg-subtle transition-colors"
              title={t("Open link")}
              aria-label={t("Open link")}
            >
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              {t("Open")}
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded text-sm text-text-tertiary hover:bg-subtle transition-colors"
              title={t("Copy link to clipboard")}
              aria-label={t("Copy link")}
            >
              <ClipboardDocumentIcon className="w-4 h-4" />
              {t("Copy")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default LinkToolbar;
