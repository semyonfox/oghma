// extracted from Notea (MIT License)
// Modernized with new sidebar components
import SidebarList from '@/components/notes/sidebar/sidebar-list';
import NoteSidebarHeader from '@/components/notes/sidebar/note-sidebar-header';
import NoteSidebarSearch from '@/components/notes/sidebar/note-sidebar-search';
import NoteSidebarFavorites from '@/components/notes/sidebar/note-sidebar-favorites';
import NoteSidebarStats from '@/components/notes/sidebar/note-sidebar-stats';
import NoteSidebarActions from '@/components/notes/sidebar/note-sidebar-actions';
import UIState from '@/lib/notes/state/ui';
import { FC, useEffect, useCallback } from 'react';
import NoteTreeState from '@/lib/notes/state/tree';

const Sidebar: FC = () => {
    const { ua } = UIState.useContainer();
    const { initTree } = NoteTreeState.useContainer();

    useEffect(() => {
        initTree()
            ?.catch((v) => console.error('Error whilst initialising tree: %O', v));
    }, [initTree]);

    return ua?.isMobileOnly ? <MobileSidebar /> : <BrowserSidebar />;
};

const BrowserSidebar: FC = () => {
    const { sidebar } = UIState.useContainer();

    const handleToggleSidebar = useCallback(() => {
        sidebar?.toggle?.();
    }, [sidebar]);

    if (sidebar?.isFold) {
        // When collapsed, show minimal vertical toolbar - keep old sidebar-tool for compact view
        return (
            <section className="flex h-full">
                {/* Vertical icon toolbar */}
                <aside className="h-full flex flex-col w-12 md:w-11 flex-none bg-background border-r border-border">
                    <div className="icon-toolbar">
                        <button
                            className="icon-button"
                            title="Search notes"
                            onClick={handleToggleSidebar}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </button>
                    </div>
                    <div className="flex-1" />
                    <div className="icon-toolbar border-t border-border">
                        <button
                            className="icon-button"
                            title="Settings"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                        <button
                            className="icon-button"
                            title="Toggle sidebar"
                            onClick={handleToggleSidebar}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                </aside>
            </section>
        );
    }

    // Full sidebar when expanded
    return (
        <div className="flex flex-col h-full w-72">
            {/* Header */}
            <NoteSidebarHeader onToggleSidebar={handleToggleSidebar} />

            {/* Search */}
            <NoteSidebarSearch />

            {/* Favorites (if any) */}
            <NoteSidebarFavorites />

            {/* Tree - scrollable */}
            <div className="tree-items">
                <h3 className="tree-section-label">📂 All Notes</h3>
                <SidebarList />
            </div>

            {/* Stats */}
            <NoteSidebarStats />

            {/* Actions */}
            <NoteSidebarActions />
        </div>
    );
};

const MobileSidebar: FC = () => {
    const { sidebar } = UIState.useContainer();

    const handleToggleSidebar = useCallback(() => {
        sidebar?.toggle?.();
    }, [sidebar]);

    // Mobile always shows full sidebar (no collapse)
    return (
        <div className="flex flex-col h-full w-4/5">
            {/* Header */}
            <NoteSidebarHeader onToggleSidebar={handleToggleSidebar} />

            {/* Search */}
            <NoteSidebarSearch />

            {/* Favorites (if any) */}
            <NoteSidebarFavorites />

            {/* Tree - scrollable */}
            <div className="tree-items">
                <h3 className="tree-section-label">📂 All Notes</h3>
                <SidebarList />
            </div>

            {/* Stats */}
            <NoteSidebarStats />

            {/* Actions */}
            <NoteSidebarActions />
        </div>
    );
};

export default Sidebar;
