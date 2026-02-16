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
import { Popover, FormControlLabel, Switch, Tooltip } from '@mui/material';
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
  }, [url]);

  const handleShare = useCallback(
    (_event: unknown, checked: boolean) => {
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

  return (
    <Popover
      anchorEl={share.anchor}
      open={share.visible}
      onClose={share.close}
      classes={{
        paper: 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white',
      }}
    >
      <section className="p-4">
        <FormControlLabel
          control={
            <Switch
              color="primary"
              checked={note?.shared === NOTE_SHARED.PUBLIC}
              onChange={handleShare}
            />
          }
          classes={{
            root: 'ml-0',
          }}
          label={
            <div className="mr-2">
              <h2 className="text-sm">{t('Share to web')}</h2>
              <p className="text-xs text-neutral-500">
                {t('Anyone can visit the page via the link')}
              </p>
            </div>
          }
          labelPlacement="start"
        />
        <div className="flex mt-4 items-center border-solid border border-neutral-300 dark:border-neutral-600 rounded overflow-hidden">
          <input
            className="w-full px-2 outline-none bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white"
            value={url}
            readOnly
          ></input>
          <Tooltip
            onClose={() => setCopied(false)}
            title={copied ? t('Copied!') : t('Copy to clipboard')}
            arrow
          >
            <IconButton
              className="flex"
              iconClassName="w-4 h-4 m-auto"
              icon="DocumentText"
              onClick={handleCopy}
            />
          </Tooltip>
        </div>
      </section>
    </Popover>
  );
};

export default ShareModal;
