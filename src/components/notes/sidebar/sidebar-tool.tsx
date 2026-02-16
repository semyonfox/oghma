// extracted from Notea (MIT License)
// rewritten for Tailwind (no MUI)
import {
    MagnifyingGlassIcon as SearchIcon,
    TrashIcon,
    ChevronDoubleLeftIcon,
    CogIcon,
} from '@heroicons/react/24/outline';
import { forwardRef, HTMLProps, useCallback } from 'react';
import UIState from '@/lib/notes/state/ui';
import Link from 'next/link';
import PortalState from '@/lib/notes/state/portal';
import useI18n from '@/lib/notes/hooks/use-i18n';

const ButtonItem = forwardRef<HTMLDivElement, HTMLProps<HTMLDivElement>>(
    (props, ref) => {
        const { children, className, ...attrs } = props;
        return (
            <div
                {...attrs}
                ref={ref}
                className={`block m-3 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 cursor-pointer transition-colors ${className || ''}`}
            >
                {children}
            </div>
        );
    }
);

ButtonItem.displayName = 'ButtonItem';

const ButtonMenu = () => {
    const { t } = useI18n();
    const {
        sidebar: { toggle, isFold },
    } = UIState.useContainer();
    const onFold = useCallback(() => {
        toggle()
            ?.catch((v: unknown) => console.error('Error whilst toggling tool: %O', v));
    }, [toggle]);

    return (
        <ButtonItem onClick={onFold} title={t('Fold sidebar')}>
            <ChevronDoubleLeftIcon
                className={`transform transition-transform ${isFold ? 'rotate-180' : ''}`}
            />
        </ButtonItem>
    );
};

const ButtonSearch = () => {
    const { t } = useI18n();
    const { search } = PortalState.useContainer();

    return (
        <ButtonItem onClick={search.open} aria-label="search" title={t('Search note')}>
            <SearchIcon />
        </ButtonItem>
    );
};

const ButtonTrash = () => {
    const { t } = useI18n();
    const { trash } = PortalState.useContainer();

    return (
        <ButtonItem onClick={trash.open} aria-label="trash" title={t('Trash')}>
            <TrashIcon />
        </ButtonItem>
    );
};

// daily notes feature - removed for MVP
// can be re-added later if needed

const ButtonSettings = () => {
    const { t } = useI18n();

    return (
        <Link href="/settings">
            <ButtonItem aria-label="settings" title={t('Settings')}>
                <CogIcon />
            </ButtonItem>
        </Link>
    );
};

const SidebarTool = () => {
    return (
        <aside className="h-full flex flex-col w-12  md:w-11 flex-none bg-neutral-100 dark:bg-neutral-800">
            <ButtonSearch />
            <ButtonTrash />

            <div className="tool mt-auto">
                <ButtonMenu></ButtonMenu>
                <ButtonSettings></ButtonSettings>
            </div>
        </aside>
    );
};

export default SidebarTool;
