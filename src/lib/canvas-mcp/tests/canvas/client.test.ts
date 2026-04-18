import { describe, it, expect, vi, beforeEach } from "vitest";
import { CanvasClient } from "../../src/canvas/client.js";
import { CanvasError } from "../../src/canvas/errors.js";

function mockFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>) {
    const fn = vi.fn();
    for (const r of responses) {
        fn.mockResolvedValueOnce(
            new Response(JSON.stringify(r.body), {
                status: r.status,
                headers: { "content-type": "application/json", ...(r.headers ?? {}) },
            }),
        );
    }
    return fn;
}

describe("CanvasClient.get", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("sends bearer auth and returns parsed JSON", async () => {
        const fetch = mockFetch([{ status: 200, body: { id: 1, name: "c1" } }]);
        const client = new CanvasClient({ domain: "x.instructure.com", token: "tok", fetch });
        const result = await client.get<{ id: number; name: string }>("/api/v1/courses/1");
        expect(result).toEqual({ id: 1, name: "c1" });
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe("https://x.instructure.com/api/v1/courses/1");
        expect((init.headers as Headers).get("authorization")).toBe("Bearer tok");
    });

    it("serializes query params", async () => {
        const fetch = mockFetch([{ status: 200, body: [] }]);
        const client = new CanvasClient({ domain: "x.instructure.com", token: "tok", fetch });
        await client.get("/api/v1/courses", { enrollment_state: "active", per_page: 50 });
        const [url] = fetch.mock.calls[0];
        expect(url).toContain("enrollment_state=active");
        expect(url).toContain("per_page=50");
    });

    it("throws CanvasError on 4xx without retry", async () => {
        const fetch = mockFetch([{ status: 404, body: { errors: [{ message: "not found" }] } }]);
        const client = new CanvasClient({ domain: "x.instructure.com", token: "tok", fetch });
        await expect(client.get("/api/v1/courses/999")).rejects.toBeInstanceOf(CanvasError);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("retries once on 5xx", async () => {
        const fetch = mockFetch([
            { status: 502, body: {} },
            { status: 200, body: { ok: true } },
        ]);
        const client = new CanvasClient({ domain: "x.instructure.com", token: "tok", fetch });
        const result = await client.get<{ ok: boolean }>("/api/v1/x");
        expect(result).toEqual({ ok: true });
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("does not retry on 401", async () => {
        const fetch = mockFetch([{ status: 401, body: { errors: [{ message: "bad token" }] } }]);
        const client = new CanvasClient({ domain: "x.instructure.com", token: "tok", fetch });
        await expect(client.get("/api/v1/self")).rejects.toMatchObject({ status: 401 });
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});

describe("CanvasClient.post", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("sends POST with JSON body and returns parsed response", async () => {
        const fetch = mockFetch([{ status: 200, body: { marked: true } }]);
        const client = new CanvasClient({ domain: "x.instructure.com", token: "tok", fetch });
        const result = await client.post<{ marked: boolean }>("/api/v1/courses/1/modules/2/items/3/mark_read");
        expect(result).toEqual({ marked: true });
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe("https://x.instructure.com/api/v1/courses/1/modules/2/items/3/mark_read");
        expect(init.method).toBe("POST");
        expect((init.headers as Headers).get("authorization")).toBe("Bearer tok");
    });
});

describe("CanvasClient.delete", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("sends DELETE and returns parsed response", async () => {
        const fetch = mockFetch([{ status: 200, body: { id: 1, deleted: true } }]);
        const client = new CanvasClient({ domain: "x.instructure.com", token: "tok", fetch });
        const result = await client.delete<{ id: number; deleted: boolean }>("/api/v1/courses/1");
        expect(result).toEqual({ id: 1, deleted: true });
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe("https://x.instructure.com/api/v1/courses/1");
        expect(init.method).toBe("DELETE");
    });
});
