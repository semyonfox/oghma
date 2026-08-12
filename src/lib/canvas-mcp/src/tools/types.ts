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

/**
 * Preserves the relationship between a tool's Zod schema and its handler.
 * Arrays of heterogeneous tools erase that relationship, so define each tool
 * through this helper before adding it to a registry.
 */
export function defineTool<Schema extends ZodTypeAny>(
    tool: ToolDef<Schema>,
): ToolDef<Schema> {
    return tool;
}

/**
 * A registry lookup loses the specific schema associated with a tool name.
 * Transport adapters validate input with that tool's schema before calling
 * this narrow dynamic-dispatch boundary.
 */
export function executeTool(
    tool: ToolDef,
    args: unknown,
    context: ToolContext,
): Promise<ToolResult> {
    return tool.handler(args, context);
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
