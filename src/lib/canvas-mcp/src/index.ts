import { createServer } from "node:http";
import { loadConfig } from "./config.ts";
import { createRequestHandler } from "./server.ts";

const cfg = loadConfig();
const http = createServer(createRequestHandler(cfg));

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
