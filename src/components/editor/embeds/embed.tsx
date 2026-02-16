// extracted from Notea (MIT License)
import useFetcher from '@/lib/notes/api/fetcher';
import { FC, useEffect, useState } from 'react';
import { Metadata } from 'unfurl.js/dist/types';
import { EmbedProps } from '.';
import DOMPurify from 'dompurify';
import { decode } from 'qss';

export const Embed: FC<EmbedProps> = ({ attrs: { href } }) => {
    const { request } = useFetcher();
    const [data, setData] = useState<Metadata>();

    useEffect(() => {
        request<undefined, Metadata>({
            url: href,
            method: 'GET',
        }).then((data) => {
            setData(data);
        });
    }, [href, request]);

    if (!data) {
        return <div className="w-full h-32 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />;
    }

    const html = (data?.oEmbed as any)?.html;

    if (html) {
        return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
    }

    const url =
        data?.open_graph?.url ??
        decode<{ url: string }>(href.replace(/.*\?/, '')).url;

    return <iframe className="w-full h-96" src={url} allowFullScreen />;
};
