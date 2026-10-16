import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequestHandler, resolveCredentials } from "../src/server.ts";
import type { Config } from "../src/config.ts";
import type { FetchLike } from "../src/canvas/client.ts";

const baseConfig: Config = {
    canvasApiToken: "env-token",
    canvasDomain: "school.instructure.com",
    port: 0,
    logLevel: "info",
};

let http: Server | undefined;

afterEach(async () => {
    await new Promise<void>((resolve) => (http ? http.close(() => resolve()) : resolve()));
    http = undefined;
});

async function start(cfg: Config, fetch: FetchLike): Promise<string> {
    http = createServer(createRequestHandler(cfg, fetch));
    await new Promise<void>((resolve) => http!.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
}

function rpc(url: string, id: number, method: string, params: unknown, headers: Record<string, string> = {}) {
    return globalThis.fetch(url, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            ...headers,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
}

describe("standalone MCP server", () => {
    it("serves more than one request and calls Canvas with the request's credentials", async () => {
        const canvasFetch = vi.fn<FetchLike>().mockImplementation(async () =>
            new Response(JSON.stringify({ id: "1", name: "Me" }), { status: 200 }),
        );
        const url = await start(baseConfig, canvasFetch);

        const first = await rpc(url, 1, "tools/list", {});
        const second = await rpc(url, 2, "tools/list", {});
        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        const listed = (await second.json()) as { result: { tools: Array<{ name: string; inputSchema: { type: string } }> } };
        expect(listed.result.tools.map((t) => t.name)).toContain("canvas_get_my_profile");
        expect(listed.result.tools.every((t) => t.inputSchema.type === "object")).toBe(true);

        const call = await rpc(url, 3, "tools/call", { name: "canvas_get_my_profile", arguments: {} }, {
            "x-canvas-token": "caller-token",
        });
        const body = (await call.json()) as { result: { content: Array<{ text: string }>; isError?: boolean } };
        expect(body.result.isError).toBeUndefined();
        expect(body.result.content[0]?.text).toContain("Me");

        const [canvasUrl, init] = canvasFetch.mock.calls[0]!;
        expect(canvasUrl).toBe("https://school.instructure.com/api/v1/users/self/profile");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer caller-token");
    });

    it("rejects GET instead of opening a stream it cannot serve", async () => {
        const url = await start(baseConfig, vi.fn<FetchLike>());
        const res = await globalThis.fetch(url, { headers: { accept: "text/event-stream" } });
        expect(res.status).toBe(405);
    });
});

describe("resolveCredentials", () => {
    it("never sends the env token to a caller-chosen host", () => {
        expect(resolveCredentials({ token: undefined, domain: "attacker.example.com" }, baseConfig)).toEqual({
            ok: false,
            status: 401,
            error: expect.any(String),
        });
        expect(resolveCredentials({ token: undefined, domain: "HTTPS://School.Instructure.com/" }, baseConfig)).toEqual({
            ok: true,
            token: "env-token",
            domain: "school.instructure.com",
        });
    });

    it("rejects hosts with ports, paths, credentials or raw IPs", () => {
        for (const domain of ["localhost:5432", "school.instructure.com/x", "user@school.instructure.com", "169.254.169.254", "localhost"]) {
            expect(resolveCredentials({ token: "t", domain }, baseConfig)).toMatchObject({ ok: false, status: 400 });
        }
    });
});
