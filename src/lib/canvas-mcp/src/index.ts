import { Server } from "@modelcontextprotocol/sdk/server/index";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types";
import type { Tool } from "@modelcontextprotocol/sdk/types";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
import { toJSONSchema } from "zod";
import { loadConfig } from "./config.ts";
import { CanvasClient } from "./canvas/client.ts";
import { allTools } from "./tools/index.ts";
import { executeTool, type ToolContext } from "./tools/types.ts";

const cfg = loadConfig();

interface RequestState {
  canvas: CanvasClient;
}

const requestStore = new AsyncLocalStorage<RequestState>();

const server = new Server(
  { name: "canvas-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: toMcpInputSchema(t.inputSchema),
  })),
}));

function toMcpInputSchema(
  schema: (typeof allTools)[number]["inputSchema"],
): Tool["inputSchema"] {
  const jsonSchema = toJSONSchema(schema);
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

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const store = requestStore.getStore();
  if (!store) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Canvas credentials missing: send X-Canvas-Token (and X-Canvas-Domain if no server default).",
        },
      ],
      isError: true,
    };
  }
  const ctx: ToolContext = { canvas: store.canvas };

  const tool = allTools.find((t) => t.name === req.params.name);
  if (!tool) {
    return {
      content: [
        { type: "text" as const, text: `Unknown tool: ${req.params.name}` },
      ],
      isError: true,
    };
  }
  const parsed = tool.inputSchema.safeParse(req.params.arguments ?? {});
  if (!parsed.success) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Invalid input: ${parsed.error.message}`,
        },
      ],
      isError: true,
    };
  }
  try {
    const result = await executeTool(tool, parsed.data, ctx);
    return {
      content: result.content.map((c) => ({
        type: "text" as const,
        text: c.text,
      })),
      isError: result.isError,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
});

// Stateless mode — each MCP request is self-contained.
// Required for Lambda (no cross-invocation state) and fine on any other host.
const transport = new StreamableHTTPServerTransport({});
await server.connect(transport as unknown as Transport);

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const http = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    writeJson(res, 200, { ok: true });
    return;
  }

  const token = headerValue(req, "x-canvas-token") ?? cfg.canvasApiToken;
  const domainRaw = headerValue(req, "x-canvas-domain") ?? cfg.canvasDomain;
  const domain = domainRaw?.replace(/^https?:\/\//, "").replace(/\/$/, "");

  if (!token || !domain) {
    writeJson(res, 401, {
      error: "Canvas credentials missing",
      detail:
        "Send X-Canvas-Token header (and X-Canvas-Domain if no server default is set).",
    });
    return;
  }

  const canvas = new CanvasClient({ domain, token });
  await requestStore.run({ canvas }, () => transport.handleRequest(req, res));
});

http.listen(cfg.port, () => {
  console.log(
    JSON.stringify({
      msg: "canvas-mcp listening",
      port: cfg.port,
      domain: cfg.canvasDomain ?? "(per-request via X-Canvas-Domain)",
      tokenFallback: cfg.canvasApiToken ? "env" : "none",
    }),
  );
});

function shutdown(signal: string): void {
  console.log(JSON.stringify({ msg: "shutting down", signal }));
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
