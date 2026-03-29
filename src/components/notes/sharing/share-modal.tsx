// archived — activate in phase 2 for public note sharing
// from Notea (MIT), original: components/portal/share-modal.tsx

import React, { FC, useCallback, useState } from "react";
import usePortalStore from "@/lib/notes/state/portal";
import IconButton from "@/components/icon-button";
import useNoteStore from "@/lib/notes/state/note";
import { NOTE_SHARED } from "@/lib/notes/types/meta";
// TODO: Convert to App Router (next/navigation) when sharing is active
// import { useRouter } from 'next/router';
import {
  useRouter as useNextRouter,
  usePathname,
  useSearchParams,
} from "next/navigation";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useUIComposite from "@/lib/notes/state/ui";

// temporary mock for Pages Router behavior
const useRouter = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nextRouter = useNextRouter();

  return {
    query: Object.fromEntries(searchParams?.entries() || []),
    pathname,
    push: nextRouter.push,
    replace: nextRouter.replace,
  };
};

const ShareModal: FC = () => {
  const { t } = useI18n();
  const { share } = usePortalStore();
  const [copied, setCopied] = useState(false);
  const { note, updateNote } = useNoteStore();
  const router = useRouter();
  const { disablePassword } = useUIComposite();

  const shareUrl = disablePassword
    ? `${location.origin}/share/${router.query.id}`
    : location.href;

  const handleCopy = useCallback(() => {
    shareUrl && navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  const handleShare = useCallback(
    (checked: boolean) => {
      updateNote({
        shared: checked ? NOTE_SHARED.PUBLIC : NOTE_SHARED.PRIVATE,
      })?.catch((v) => console.error("Error whilst updating note: %O", v));
    },
    [updateNote],
  );

  if (!share.visible || !share.anchor) {
    return null;
  }

  const rect = share.anchor.getBoundingClientRect();
  const top = rect.bottom + 4;
  const left = rect.left;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={share.close} />

      {/* Popover */}
      <div
        className="fixed z-50 bg-surface text-text-secondary rounded-lg shadow-xl border border-border"
        style={{ top, left }}
      >
        <section className="p-4 min-w-80">
          {/* Share Toggle */}
          <div className="flex items-start space-x-2 mb-4">
            <input
              type="checkbox"
              className="mt-1 rounded"
              checked={note?.shared === NOTE_SHARED.PUBLIC}
              onChange={(e) => handleShare(e.target.checked)}
            />
            <div className="flex-1">
              <h2 className="text-sm font-medium">{t("Share to web")}</h2>
              <p className="text-xs text-text-tertiary">
                {t("Anyone can visit the page via the link")}
              </p>
            </div>
          </div>

          {/* Share URL Input */}
          <div className="flex items-center border border-border rounded overflow-hidden">
            <input
              className="flex-1 px-2 py-1 outline-none bg-surface-elevated text-text-secondary text-sm"
              value={shareUrl}
              readOnly
            />
            <div
              className="relative group"
              onMouseEnter={() => {}}
              onMouseLeave={() => setCopied(false)}
            >
              <IconButton
                className="flex"
                iconClassName="w-4 h-4 m-auto"
                icon="DocumentText"
                onClick={handleCopy}
              />
              {copied && (
                <div className="absolute bottom-full right-0 mb-2 px-2 py-1 text-xs font-medium text-text-secondary bg-surface rounded whitespace-nowrap pointer-events-none">
                  {t("Copied!")}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default ShareModal;
