import { createServer } from "node:http";
import { assertListenAllowed, loadConfig } from "./config.ts";
import { createRequestHandler } from "./server.ts";

const cfg = loadConfig();
try {
    assertListenAllowed(cfg);
} catch (error) {
    console.error(JSON.stringify({
        msg: "refusing to listen",
        error: error instanceof Error ? error.message : String(error),
    }));
    process.exit(1);
}
const http = createServer(createRequestHandler(cfg));

http.listen(cfg.port, cfg.host, () => {
    console.log(
        JSON.stringify({
            msg: "canvas-mcp listening",
            host: cfg.host,
            port: cfg.port,
            domain: cfg.canvasDomain ?? "(per-request via X-Canvas-Domain)",
            tokenFallback: cfg.canvasApiToken ? "env" : "none",
            auth: cfg.authToken ? "required" : "loopback-only",
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
