// extracted from Notea (MIT License)
import CsrfTokenState from '@/lib/notes/state/csrf-token';
import { useCallback, ComponentType } from 'react';
import { Bookmark } from './bookmark';
import { Embed } from './embed';

export type EmbedProps = {
    attrs: {
        href: string;
        matches: string[];
    };
};

export type EmbedConfig = {
    title: string;
    matcher: (url: string) => RegExpMatchArray | null;
    component: ComponentType<EmbedProps>;
};

export const useEmbeds = (): EmbedConfig[] => {
    const csrfToken = CsrfTokenState.useContainer();

    const createEmbedComponent = useCallback(
        (Component: ComponentType<EmbedProps>) => {
            return (props: EmbedProps) => {
                return (
                    <CsrfTokenState.Provider initialState={csrfToken}>
                        <Component {...props} />
                    </CsrfTokenState.Provider>
                );
            };
        },
        [csrfToken]
    );

    return [
        {
            title: 'Bookmark',
            matcher: (url) => url.match(/^\/api\/extract\?type=bookmark/),
            component: createEmbedComponent(Bookmark),
        },
        {
            title: 'Embed',
            matcher: (url) => url.match(/^\/api\/extract\?type=embed/),
            component: createEmbedComponent(Embed),
        },
    ];
};
