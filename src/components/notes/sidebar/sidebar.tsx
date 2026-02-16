// extracted from Notea (MIT License)
import SidebarTool from '@/components/notes/sidebar/sidebar-tool';
import SidebarList from '@/components/notes/sidebar/sidebar-list';
import UIState from '@/lib/notes/state/ui';
import { FC, useEffect } from 'react';
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
    const {
        sidebar,
    } = UIState.useContainer();

    return (
        <section className="flex h-full w-full">
            <SidebarTool />
            {sidebar?.isFold ? null : <SidebarList />}
        </section>
    );
};

const MobileSidebar: FC = () => {
    return (
        <section className="flex h-full w-4/5">
            <SidebarTool />
            <SidebarList />
        </section>
    );
};

export default Sidebar;
