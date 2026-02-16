// extracted from Notea (MIT License)
// original: components/portal/share-modal.tsx
// 
// ⚠️ ARCHIVED FOR PHASE 2+ ⚠️
// This component is part of the sharing feature infrastructure.
// It is NOT active in Phase 1. Activate in Phase 2+ when ready to enable
// public note sharing functionality.
//
// To activate:
// 1. Ensure 'shared' field in notes table is properly indexed
// 2. Create public share page at /share/[id]
// 3. Wire up ShareModal in portal state
// 4. Test with both public and private shares

import React, { FC, useCallback, useEffect, useState } from 'react';
import PortalState from '@/lib/notes/state/portal';
import IconButton from '@/components/icon-button';
import NoteState from '@/lib/notes/state/note';
import { NOTE_SHARED } from '@/lib/notes/types/meta';
// TODO: Convert to App Router (next/navigation) when sharing is active
// import { useRouter } from 'next/router';
import { useRouter as useNextRouter, usePathname, useSearchParams } from 'next/navigation';
import useI18n from '@/lib/notes/hooks/use-i18n';
import UIState from '@/lib/notes/state/ui';

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
  const { share } = PortalState.useContainer();
  const [url, setUrl] = useState<string>();
  const [copied, setCopied] = useState(false);
  const { note, updateNote } = NoteState.useContainer();
  const router = useRouter();
  const { disablePassword } = UIState.useContainer();

  const handleCopy = useCallback(() => {
    url && navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [url]);

  const handleShare = useCallback(
    (checked: boolean) => {
      updateNote({
        shared: checked ? NOTE_SHARED.PUBLIC : NOTE_SHARED.PRIVATE,
      })?.catch((v) => console.error('Error whilst updating note: %O', v));
    },
    [updateNote]
  );

  useEffect(() => {
    if (disablePassword) {
      setUrl(`${location.origin}/share/${router.query.id}`);
    } else {
      setUrl(location.href);
    }
  }, [disablePassword, router.query]);

  if (!share.visible || !share.anchor) {
    return null;
  }

  const rect = share.anchor.getBoundingClientRect();
  const top = rect.bottom + 4;
  const left = rect.left;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={share.close}
      />
      
      {/* Popover */}
      <div
        className="fixed z-50 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-700"
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
              <h2 className="text-sm font-medium">{t('Share to web')}</h2>
              <p className="text-xs text-neutral-500">
                {t('Anyone can visit the page via the link')}
              </p>
            </div>
          </div>

          {/* Share URL Input */}
          <div className="flex items-center border border-neutral-300 dark:border-neutral-600 rounded overflow-hidden">
            <input
              className="flex-1 px-2 py-1 outline-none bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white text-sm"
              value={url}
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
                <div className="absolute bottom-full right-0 mb-2 px-2 py-1 text-xs font-medium text-white bg-neutral-700 rounded whitespace-nowrap pointer-events-none">
                  {t('Copied!')}
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
