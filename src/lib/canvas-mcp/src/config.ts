import { z } from "zod";

const envSchema = z.object({
    CANVAS_API_TOKEN: z.string().optional(),
    CANVAS_DOMAIN: z.string().optional(),
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
    port: number;
    logLevel: "debug" | "info" | "warn" | "error";
}

function normaliseDomain(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return trimmed.length > 0 ? trimmed : undefined;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
    const parsed = envSchema.parse(env);
    const token = parsed.CANVAS_API_TOKEN && parsed.CANVAS_API_TOKEN.length > 0
        ? parsed.CANVAS_API_TOKEN
        : undefined;
    return {
        canvasApiToken: token,
        canvasDomain: normaliseDomain(parsed.CANVAS_DOMAIN),
        port: parsed.PORT,
        logLevel: parsed.LOG_LEVEL,
    };
}
