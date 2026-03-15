// extracted from Notea (MIT License)
import { create } from 'zustand';
import { Settings, DEFAULT_SETTINGS } from '@/lib/notes/types/settings';
import { UserAgentType } from '@/lib/notes/types/ua';
import useSettingsStore from './settings';
import createSidebarStore from './sidebar';
import createSplitStore from './split';
import useTitleStore from './title';

const DEFAULT_UA: UserAgentType = {
    isMobile: false,
    isMobileOnly: false,
    isTablet: false,
    isBrowser: true,
    isWechat: false,
    isMac: false,
};

interface SidebarState {
    isFold: boolean;
    toggle: (state?: boolean) => Promise<void>;
    open: () => void;
    close: () => void;
}

interface SplitState {
    sizes: [number, number];
    saveSizes: (newSizes: [number, number]) => Promise<void>;
    resize: (scale: number) => [number, number];
}

interface TitleState {
    value: string;
    updateTitle: (text?: string) => void;
}

interface SettingsState {
    settings: Settings;
    setSettings: (settings: Settings) => void;
    updateSettings: (body: Partial<Settings>) => Promise<void>;
}

interface UIStoreData {
    ua: UserAgentType;
    disablePassword?: boolean;
    IS_DEMO?: boolean;
}

interface UIState extends UIStoreData {
    sidebar: SidebarState;
    split: SplitState;
    title: TitleState;
    settings: SettingsState;
}

// Store to hold base UI state
const useUIBaseStore = create<UIStoreData>((set) => ({
    ua: DEFAULT_UA,
    disablePassword: undefined,
    IS_DEMO: undefined,
}));

// Initialize with props
export const initUIStore = ({
    ua = DEFAULT_UA,
    settings,
    disablePassword,
    IS_DEMO,
}: {
    ua?: UserAgentType;
    settings?: Settings;
    disablePassword?: boolean;
    IS_DEMO?: boolean;
} = {}) => {
    useUIBaseStore.setState({
        ua,
        disablePassword,
        IS_DEMO,
    });
};

// module-scope stores — created once, hook identity is stable across renders
const useSidebarStore = createSidebarStore(false, false);
const useSplitStore = createSplitStore(DEFAULT_SETTINGS.split_sizes);

// Composite hook that returns full UI state
export const useUIComposite = (): UIState => {
    const baseState = useUIBaseStore();
    const sidebar = useSidebarStore();
    const split = useSplitStore();
    const title = useTitleStore();
    const settings = useSettingsStore();

    return {
        ...baseState,
        sidebar,
        split,
        title,
        settings,
    };
};

export default useUIComposite;
