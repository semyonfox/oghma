import { CanvasError } from "./errors";
import { parseNextLink } from "./pagination";

export type FetchLike = typeof fetch;

export interface CanvasClientOptions {
    domain: string;
    token: string;
    fetch?: FetchLike;
    timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

type QueryValue = string | number | boolean | undefined | null | Array<string | number | boolean>;
export type Query = Record<string, QueryValue>;

export class CanvasClient {
    private readonly baseUrl: string;
    private readonly token: string;
    private readonly fetchImpl: FetchLike;
    private readonly timeoutMs: number;

    constructor(opts: CanvasClientOptions) {
        this.baseUrl = `https://${opts.domain}`;
        this.token = opts.token;
        this.fetchImpl = opts.fetch ?? fetch;
        this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }

    async get<T>(path: string, query?: Query): Promise<T> {
        const res = await this.request(path, { method: "GET", ...(query !== undefined ? { query } : {}) });
        return (await res.json()) as T;
    }

    async post<T>(path: string, body?: unknown): Promise<T> {
        const res = await this.request(path, { method: "POST", ...(body !== undefined ? { body } : {}) });
        return (await res.json()) as T;
    }

    async put<T>(path: string, body?: unknown): Promise<T> {
        const res = await this.request(path, { method: "PUT", ...(body !== undefined ? { body } : {}) });
        return (await res.json()) as T;
    }

    async delete<T>(path: string, body?: unknown): Promise<T> {
        const res = await this.request(path, { method: "DELETE", ...(body !== undefined ? { body } : {}) });
        return (await res.json()) as T;
    }

    async getRaw(path: string, query?: Query): Promise<Response> {
        return this.request(path, { method: "GET", ...(query !== undefined ? { query } : {}) });
    }

    async *getPaginated<T>(path: string, query?: Query): AsyncIterable<T[]> {
        let res = await this.request(path, { method: "GET", ...(query !== undefined ? { query } : {}) });
        while (true) {
            const batch = (await res.json()) as T[];
            yield batch;
            const next = parseNextLink(res.headers.get("link"));
            if (!next) return;
            res = await this.requestAbsolute(next);
        }
    }

    async collectPaginated<T>(path: string, query?: Query): Promise<T[]> {
        const all: T[] = [];
        for await (const batch of this.getPaginated<T>(path, query)) all.push(...batch);
        return all;
    }

    private async requestAbsolute(url: string): Promise<Response> {
        const headers = new Headers({ authorization: `Bearer ${this.token}`, accept: "application/json" });
        const init = (): RequestInit => ({ method: "GET", headers, signal: AbortSignal.timeout(this.timeoutMs) });
        let res = await this.fetchImpl(url, init());
        if (res.status >= 500) {
            await new Promise((r) => setTimeout(r, 200));
            res = await this.fetchImpl(url, init());
        }
        if (!res.ok) {
            throw new CanvasError(res.status, `Canvas pagination fetch failed: ${res.statusText}`);
        }
        return res;
    }

    private async request(path: string, opts: { method: string; query?: Query; body?: unknown }): Promise<Response> {
        const url = this.buildUrl(path, opts.query);
        const headers = new Headers({
            authorization: `Bearer ${this.token}`,
            accept: "application/json",
        });
        if (opts.body !== undefined) headers.set("content-type", "application/json");

        const init: RequestInit = {
            method: opts.method,
            headers,
            signal: AbortSignal.timeout(this.timeoutMs),
            ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        };

        let res = await this.fetchImpl(url, init);
        if (res.status >= 500) {
            await sleep(200 + Math.random() * 200);
            res = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
        }

        if (!res.ok) {
            const body = await safeJson(res);
            const canvasMessage = extractCanvasMessage(body) ?? res.statusText;
            throw new CanvasError(res.status, `Canvas ${opts.method} ${path} failed: ${canvasMessage}`, { body });
        }
        return res;
    }

    private buildUrl(path: string, query?: Query): string {
        const url = new URL(path.startsWith("/") ? path : `/${path}`, this.baseUrl);
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

async function safeJson(res: Response): Promise<unknown> {
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
        const first = b.errors[0];
        if (first && typeof first === "object" && "message" in first) {
            return String((first as { message: unknown }).message);
        }
    }
    if (typeof b.message === "string") return b.message;
    return undefined;
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
