import type { z, ZodTypeAny } from "zod";
import type { CanvasClient } from "../canvas/client.ts";

export interface ToolContext {
    canvas: CanvasClient;
}

export interface ToolDef<Schema extends ZodTypeAny = ZodTypeAny> {
    name: string;
    description: string;
    inputSchema: Schema;
    handler: (args: z.infer<Schema>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolResult {
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
}

export function textResult(text: string): ToolResult {
    return { content: [{ type: "text", text }] };
}

export function jsonResult(value: unknown): ToolResult {
    return textResult(JSON.stringify(value, null, 2));
}
