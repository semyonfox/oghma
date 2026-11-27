import { z } from "zod";

const envSchema = z.object({
    CANVAS_API_TOKEN: z.string().optional(),
    CANVAS_DOMAIN: z.string().optional(),
    CANVAS_MCP_HOST: z.string().optional(),
    CANVAS_MCP_AUTH_TOKEN: z.string().optional(),
    PORT: z
        .string()
        .optional()
        .transform((v) => (v ? Number.parseInt(v, 10) : 3001))
        .pipe(z.number().int().positive()),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export interface Config {
    canvasApiToken: string | undefined;
    canvasDomain: string | undefined;
    host: string;
    authToken: string | undefined;
    port: number;
    logLevel: "debug" | "info" | "warn" | "error";
}

export function isLoopbackHost(host: string): boolean {
    const value = host.trim().toLowerCase();
    return value === "127.0.0.1" || value === "localhost" || value === "::1" || value === "[::1]";
}

export function assertListenAllowed(cfg: Pick<Config, "host" | "authToken">): void {
    if (isLoopbackHost(cfg.host) || cfg.authToken) return;
    throw new Error(
        "CANVAS_MCP_AUTH_TOKEN is required when CANVAS_MCP_HOST is not a loopback address",
    );
}

function normaliseDomain(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    return trimmed.length > 0 ? trimmed : undefined;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
    const parsed = envSchema.parse(env);
    const token = parsed.CANVAS_API_TOKEN && parsed.CANVAS_API_TOKEN.length > 0
        ? parsed.CANVAS_API_TOKEN
        : undefined;
    const host = parsed.CANVAS_MCP_HOST?.trim();
    const authToken = parsed.CANVAS_MCP_AUTH_TOKEN?.trim();
    return {
        canvasApiToken: token,
        canvasDomain: normaliseDomain(parsed.CANVAS_DOMAIN),
        host: host && host.length > 0 ? host : "127.0.0.1",
        authToken: authToken && authToken.length > 0 ? authToken : undefined,
        port: parsed.PORT,
        logLevel: parsed.LOG_LEVEL,
    };
}
