// extracted from Notea (MIT License)
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
    const createEmbedComponent = useCallback(
        (Component: ComponentType<EmbedProps>) => {
            return (props: EmbedProps) => {
                return <Component {...props} />;
            };
        },
        []
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
