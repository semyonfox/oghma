// extracted from Notea (MIT License)
import useFetcher from '@/lib/notes/api/fetcher';
import { decode } from 'qss';
import { FC, useEffect, useState } from 'react';
import { Metadata } from 'unfurl.js/dist/types';
import { EmbedProps } from '.';

export const Bookmark: FC<EmbedProps> = ({ attrs: { href } }) => {
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

    const image = data?.open_graph?.images?.[0].url ?? data?.favicon;
    const title = data?.open_graph?.title ?? data?.title;
    const description = data?.open_graph?.description ?? data?.description;
    const url =
        data?.open_graph?.url ??
        decode<{ url: string }>(href.replace(/.*\?/, '')).url;

    if (!data) {
        return <div className="w-full h-32 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />;
    }

    return (
        <a
            className="bookmark overflow-hidden border-neutral-200 dark:border-neutral-700 border rounded flex h-32 !no-underline hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-colors"
            href={url}
            target="_blank"
            rel="noreferrer"
        >
            <div className="flex-1 p-2 overflow-hidden">
                <div className="mb-2 block text-neutral-800 dark:text-neutral-100 overflow-ellipsis overflow-hidden h-6">
                    {title}
                </div>
                <div className="text-sm overflow-ellipsis overflow-hidden h-10 text-neutral-400 mb-2">
                    {description}
                </div>
                <div className="text-sm overflow-ellipsis overflow-hidden h-5 text-neutral-500">
                    {url}
                </div>
            </div>
            {!!image && (
                <div className="md:w-48 flex w-0">
                    <img
                        className="m-auto object-cover h-full"
                        src={image}
                        alt={title}
                    />
                </div>
            )}
        </a>
    );
};
