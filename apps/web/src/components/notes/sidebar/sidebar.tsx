// extracted from Notea (MIT License)
import SidebarTool from '@/components/notes/sidebar/sidebar-tool';
import SideBarList from '@/components/notes/sidebar/sidebar-list';
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
        split: { sizes },
    } = UIState.useContainer();

    return (
        <section
            className="flex h-full fixed left-0"
            style={{
                width: `calc(${sizes[0]}% - 5px)`,
            }}
        >
            <SidebarTool />
            {sidebar.isFold ? null : <SideBarList />}
        </section>
    );
};

const MobileSidebar: FC = () => {
    return (
        <section className="flex h-full" style={{ width: '80vw' }}>
            <SidebarTool />
            <SideBarList />
        </section>
    );
};

export default Sidebar;
