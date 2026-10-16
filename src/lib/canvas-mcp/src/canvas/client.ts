import { CanvasError } from "./errors.ts";
import { parseNextLink } from "./pagination.ts";

type CanvasResponse = {
    status: number;
    statusText: string;
    ok: boolean;
    headers: { get(name: string): string | null };
    body?: { cancel(): Promise<void> } | null;
    json(): Promise<unknown>;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<CanvasResponse>;

export interface CanvasClientOptions {
    domain: string;
    token: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    maxPages?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
// 20 pages of 100 is far more than a model can use, and stops one tool call
// from walking a huge inbox or file tree for minutes
const DEFAULT_MAX_PAGES = 20;
const CANVAS_JSON_ACCEPT = "application/json+canvas-string-ids";

type QueryValue = string | number | boolean | undefined | null | Array<string | number | boolean>;
export type Query = Record<string, QueryValue>;

export class CanvasClient {
    private readonly origin: string;
    private readonly token: string;
    private readonly fetchImpl: FetchLike;
    private readonly timeoutMs: number;
    private readonly maxPages: number;

    constructor(opts: CanvasClientOptions) {
        this.origin = new URL(`https://${opts.domain}`).origin;
        this.token = opts.token;
        this.fetchImpl = opts.fetch ?? fetch;
        this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
    }

    async get<T>(path: string, query?: Query): Promise<T> {
        const res = await this.send("GET", this.buildUrl(path, query), path);
        return (await res.json()) as T;
    }

    async post<T>(path: string, body?: unknown): Promise<T> {
        const res = await this.send("POST", this.buildUrl(path), path, body);
        return (await res.json()) as T;
    }

    async put<T>(path: string, body?: unknown): Promise<T> {
        const res = await this.send("PUT", this.buildUrl(path), path, body);
        return (await res.json()) as T;
    }

    async delete<T>(path: string, body?: unknown): Promise<T> {
        const res = await this.send("DELETE", this.buildUrl(path), path, body);
        return (await res.json()) as T;
    }

    async *getPaginated<T>(path: string, query?: Query): AsyncIterable<T[]> {
        let url = this.buildUrl(path, query);
        for (let page = 0; page < this.maxPages; page++) {
            const res = await this.send("GET", url, path);
            yield (await res.json()) as T[];
            const next = parseNextLink(res.headers.get("link"));
            if (!next) return;
            if (new URL(next).origin !== this.origin) {
                throw new CanvasError(400, "Canvas pagination URL points to another host");
            }
            url = next;
        }
    }

    async collectPaginated<T>(path: string, query?: Query): Promise<T[]> {
        const all: T[] = [];
        for await (const batch of this.getPaginated<T>(path, query)) all.push(...batch);
        return all;
    }

    private async send(method: string, url: string, label: string, body?: unknown): Promise<CanvasResponse> {
        const headers = new Headers({
            authorization: `Bearer ${this.token}`,
            accept: CANVAS_JSON_ACCEPT,
        });
        if (body !== undefined) headers.set("content-type", "application/json");
        const init = (): RequestInit => ({
            method,
            headers,
            redirect: "manual",
            signal: AbortSignal.timeout(this.timeoutMs),
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });

        let res = await this.fetchImpl(url, init());
        // a 5xx after a write may still have applied it, so only reads are
        // retried. resending a submission or message would duplicate it
        if (res.status >= 500 && method === "GET") {
            await res.body?.cancel().catch(() => {});
            await sleep(200 + Math.random() * 200);
            res = await this.fetchImpl(url, init());
        }

        if (!res.ok) {
            const errorBody = await safeJson(res);
            const canvasMessage = extractCanvasMessage(errorBody) ?? res.statusText;
            throw new CanvasError(res.status, `Canvas ${method} ${label} failed: ${canvasMessage}`, { body: errorBody });
        }
        return res;
    }

    private buildUrl(path: string, query?: Query): string {
        const url = new URL(path.startsWith("/") ? path : `/${path}`, this.origin);
        if (url.origin !== this.origin) {
            throw new CanvasError(400, "Canvas path points to another host");
        }
        if (query) {
            for (const [k, v] of Object.entries(query)) {
                if (v === undefined || v === null) continue;
                if (Array.isArray(v)) {
                    for (const item of v) url.searchParams.append(`${k}[]`, String(item));
                } else {
                    url.searchParams.set(k, String(v));
                }
            }
        }
        return url.toString();
    }
}

async function safeJson(res: CanvasResponse): Promise<unknown> {
    try {
        return await res.json();
    } catch {
        return undefined;
    }
}

function extractCanvasMessage(body: unknown): string | undefined {
    if (!body || typeof body !== "object") return undefined;
    const b = body as { errors?: unknown; message?: unknown };
    if (Array.isArray(b.errors) && b.errors.length > 0) {
        const first: unknown = b.errors[0];
        if (first && typeof first === "object" && "message" in first) {
            return String(first.message);
        }
    }
    if (typeof b.message === "string") return b.message;
    return undefined;
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
