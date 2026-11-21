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
        const fetch = mockFetch([{ status: 200, body: { id: "9007199254740993", name: "c1" } }]);
        const client = new CanvasClient({ domain: "x.instructure.com", token: "tok", fetch });
        const result = await client.get<{ id: string; name: string }>("/api/v1/courses/1");
        expect(result).toEqual({ id: "9007199254740993", name: "c1" });
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe("https://x.instructure.com/api/v1/courses/1");
        expect((init.headers as Headers).get("authorization")).toBe("Bearer tok");
        expect((init.headers as Headers).get("accept")).toBe(
            "application/json+canvas-string-ids",
        );
    });

    it("serializes query params", async () => {
        const fetch = mockFetch([{ status: 200, body: [] }]);
        const client = new CanvasClient({ domain: "x.instructure.com", token: "tok", fetch });
        await client.get("/api/v1/courses", { enrollment_state: "active", per_page: 50 });
        const [url] = fetch.mock.calls[0];
        expect(url).toContain("enrollment_state=active");
        expect(url).toContain("per_page=50");
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
        const result = client.get("/api/v1/self");
        await expect(result).rejects.toBeInstanceOf(CanvasError);
        await expect(result).rejects.toMatchObject({ status: 401 });
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});

describe("CanvasClient.post", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("sends POST with JSON body and returns parsed response", async () => {
        const created = { id: "5" };
        const fetch = mockFetch([{ status: 200, body: created }]);
        const client = new CanvasClient({ domain: "x.instructure.com", token: "tok", fetch });
        const body = { body: "Fixture message", recipients: ["1"] };
        const result = await client.post("/api/v1/conversations", body);
        expect(result).toEqual(created);
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe("https://x.instructure.com/api/v1/conversations");
        expect(init.method).toBe("POST");
        expect((init.headers as Headers).get("authorization")).toBe("Bearer tok");
        expect((init.headers as Headers).get("content-type")).toBe("application/json");
        expect(init.body).toBe(JSON.stringify(body));
    });

    it("does not resend a write after a 5xx because Canvas may have applied it", async () => {
        const fetch = mockFetch([
            { status: 502, body: {} },
            { status: 200, body: { id: 1 } },
        ]);
        const client = new CanvasClient({ domain: "x.instructure.com", token: "tok", fetch });
        await expect(
            client.post("/api/v1/conversations", { body: "hi", recipients: ["1"] }),
        ).rejects.toMatchObject({ status: 502 });
        expect(fetch).toHaveBeenCalledTimes(1);
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
