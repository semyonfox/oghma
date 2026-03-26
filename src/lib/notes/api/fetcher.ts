// extracted from Notea (MIT License)
import { useCallback, useRef, useState } from 'react';
import { deduplicatedFetch, recordRequest } from './request-deduplicator';

interface Params {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers?: Record<string, string>;
}

export default function useFetcher() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>();
    const abortRef = useRef<AbortController | undefined>(undefined);
    const request = useCallback(
        async function request<Payload, ReponseData>(
            params: Params,
            payload?: Payload | string
        ): Promise<ReponseData | undefined> {
            const controller = new AbortController();

            setLoading(true);
            setError('');
            abortRef.current = controller;

            const init: RequestInit = {
                signal: controller.signal,
                method: params.method,
            };

            init.headers = {};

            if (payload instanceof FormData) {
                init.body = payload;
            } else {
                init.body = JSON.stringify(payload);
                init.headers['Content-Type'] = 'application/json';
            }

            init.headers = {
                ...init.headers,
                ...(params.headers || {}),
            };

            try {
                // Use deduplication for GET requests to avoid duplicate API calls
                const useDeduplication = params.method === 'GET';
                
                let data: any;
                if (useDeduplication) {
                    // For GET: use deduplication to avoid sending duplicate requests
                    data = await deduplicatedFetch(params.url, init);
                    recordRequest(false); // Count this request
                } else {
                    // For POST/PUT/DELETE: always make fresh requests
                    const response = await fetch(params.url, init);
                    
                    if (!response.ok) {
                        throw await response.text();
                    }
                    if (response.status === 204) {
                        return;
                    }
                    
                    data = await response.json();
                }

                return data;
            } catch (e) {
                if (!controller?.signal.aborted) {
                    setError(String(e));
                }
            } finally {
                setLoading(false);
            }
        },
        []
    );

    const abort = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    return { loading, request, abort, error };
}
