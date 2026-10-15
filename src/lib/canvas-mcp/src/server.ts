import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    type CallToolResult,
    type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { toJSONSchema } from "zod";
import { CanvasClient, type FetchLike } from "./canvas/client.ts";
import type { Config } from "./config.ts";
import { allTools } from "./tools/index.ts";
import { executeTool, type ToolDef } from "./tools/types.ts";

export function createCanvasMcpServer(canvas: CanvasClient, tools: ToolDef[] = allTools): Server {
    const server = new Server(
        { name: "canvas-mcp", version: "0.2.0" },
        { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: toMcpInputSchema(t.inputSchema),
        })),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
        const tool = tools.find((t) => t.name === req.params.name);
        if (!tool) return errorResult(`Unknown tool: ${req.params.name}`);

        const parsed = tool.inputSchema.safeParse(req.params.arguments ?? {});
        if (!parsed.success) return errorResult(`Invalid input: ${parsed.error.message}`);

        try {
            const result = await executeTool(tool, parsed.data, { canvas });
            return {
                content: result.content.map((c) => ({ type: "text" as const, text: c.text })),
                ...(result.isError !== undefined ? { isError: result.isError } : {}),
            };
        } catch (err) {
            return errorResult(err instanceof Error ? err.message : String(err));
        }
    });

    return server;
}

function errorResult(text: string): CallToolResult {
    return { content: [{ type: "text", text }], isError: true };
}

function toMcpInputSchema(schema: ToolDef["inputSchema"]): Tool["inputSchema"] {
    const jsonSchema = toJSONSchema(schema, { io: "input" });
    if (jsonSchema.type !== "object") {
        throw new TypeError("Canvas MCP tool input schemas must be objects");
    }

    const { properties, required, ...metadata } = jsonSchema;
    const inputSchema: Tool["inputSchema"] = { ...metadata, type: "object" };

    if (properties !== undefined) {
        const entries: Array<[string, unknown]> = Object.entries(properties);
        if (!entries.every((entry): entry is [string, object] => isObject(entry[1]))) {
            throw new TypeError("Canvas MCP tool properties must be JSON Schema objects");
        }
        inputSchema.properties = Object.fromEntries(entries);
    }

    if (required !== undefined) {
        if (!Array.isArray(required) || !required.every((value) => typeof value === "string")) {
            throw new TypeError("Canvas MCP required properties must be strings");
        }
        inputSchema.required = required;
    }

    return inputSchema;
}

function isObject(value: unknown): value is object {
    return typeof value === "object" && value !== null;
}

export type CredentialResult =
    | { ok: true; token: string; domain: string }
    | { ok: false; status: number; error: string };

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/;

export function resolveCredentials(
    headers: { token: string | undefined; domain: string | undefined },
    cfg: Pick<Config, "canvasApiToken" | "canvasDomain">,
): CredentialResult {
    const domain = normaliseDomain(headers.domain) ?? cfg.canvasDomain;
    if (!domain || !HOSTNAME.test(domain)) {
        return { ok: false, status: 400, error: "X-Canvas-Domain must be a Canvas host name such as school.instructure.com" };
    }
    // the env token belongs to the configured host. a caller who picks another
    // host must bring their own token, or the server would hand ours to them
    const token = headers.token ?? (domain === cfg.canvasDomain ? cfg.canvasApiToken : undefined);
    if (!token) {
        return { ok: false, status: 401, error: "Send X-Canvas-Token (and X-Canvas-Domain if no server default is set)." };
    }
    return { ok: true, token, domain };
}

function normaliseDomain(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    return trimmed.length > 0 ? trimmed : undefined;
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
    const raw = req.headers[name];
    return Array.isArray(raw) ? raw[0] : raw;
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
}

export function createRequestHandler(cfg: Config, fetch?: FetchLike) {
    return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (req.method === "GET" && req.url === "/health") {
            writeJson(res, 200, { ok: true });
            return;
        }
        // stateless mode has no SSE stream or session to resume or delete
        if (req.method !== "POST") {
            res.setHeader("allow", "POST");
            writeJson(res, 405, { error: "Method not allowed" });
            return;
        }

        const credentials = resolveCredentials(
            { token: headerValue(req, "x-canvas-token"), domain: headerValue(req, "x-canvas-domain") },
            cfg,
        );
        if (!credentials.ok) {
            writeJson(res, credentials.status, { error: credentials.error });
            return;
        }

        const canvas = new CanvasClient({
            domain: credentials.domain,
            token: credentials.token,
            ...(fetch !== undefined ? { fetch } : {}),
        });
        // the SDK's stateless transport serves exactly one request, so each
        // request gets its own server and transport. leaving out
        // sessionIdGenerator is what makes it stateless
        const server = createCanvasMcpServer(canvas);
        const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
        res.on("close", () => {
            void transport.close().catch(() => {});
            void server.close().catch(() => {});
        });

        try {
            // the SDK's optional callbacks are not typed for exactOptionalPropertyTypes
            await server.connect(transport as Transport);
            await transport.handleRequest(req, res);
        } catch (err) {
            console.error(JSON.stringify({ msg: "mcp request failed", error: err instanceof Error ? err.message : String(err) }));
            if (!res.headersSent) writeJson(res, 500, { error: "MCP request failed" });
        }
    };
}
