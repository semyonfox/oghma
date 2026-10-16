import { z } from "zod";
import { canvasIdSchema } from "./canvas-id.ts";
import type { ToolDef } from "./types.ts";
import { defineTool, jsonResult } from "./types.ts";

export const messageTools: ToolDef[] = [
    defineTool({
        name: "canvas_list_conversations",
        description:
            "List conversations (inbox) for the authenticated user. Optionally filter by scope (unread, starred, archived, sent) and filter[].",
        inputSchema: z.object({
            scope: z.enum(["unread", "starred", "archived", "sent"]).optional(),
            filter: z.array(z.string()).optional(),
            include: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            const conversations = await canvas.collectPaginated("/api/v1/conversations", {
                per_page: 100,
                ...(args.scope ? { scope: args.scope } : {}),
                ...(args.filter ? { filter: args.filter } : {}),
                ...(args.include ? { include: args.include } : {}),
            });
            return jsonResult(conversations);
        },
    }),
    defineTool({
        name: "canvas_get_conversation",
        description: "Get full details for a single conversation by ID. Does not mark it as read.",
        inputSchema: z.object({
            conversation_id: canvasIdSchema,
            include: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            // canvas marks a conversation read on GET by default, which would
            // make this read-only tool change inbox state
            const conversation = await canvas.get(`/api/v1/conversations/${args.conversation_id}`, {
                auto_mark_as_read: false,
                ...(args.include ? { include: args.include } : {}),
            });
            return jsonResult(conversation);
        },
    }),
    defineTool({
        name: "canvas_get_unread_count",
        description: "Get the number of unread conversations in the authenticated user's inbox.",
        inputSchema: z.object({}),
        handler: async (_args, { canvas }) => {
            const result = await canvas.get("/api/v1/conversations/unread_count", {});
            return jsonResult(result);
        },
    }),
    defineTool({
        name: "canvas_mark_conversation_read",
        description:
            "Mark a conversation as read (or set another workflow_state). Safe self-state toggle only.",
        inputSchema: z.object({
            conversation_id: canvasIdSchema,
            workflow_state: z.enum(["read", "unread", "archived"]).optional(),
        }),
        handler: async (args, { canvas }) => {
            const state = args.workflow_state ?? "read";
            const result = await canvas.put(`/api/v1/conversations/${args.conversation_id}`, {
                conversation: { workflow_state: state },
            });
            return jsonResult(result);
        },
    }),

    defineTool({
        name: "canvas_send_conversation",
        description:
            "Send a new Canvas inbox message to one or more recipients (user IDs or context codes like course_123_students where Canvas allows it).",
        inputSchema: z.object({
            recipients: z.array(z.string()),
            subject: z.string().optional(),
            body: z.string(),
            context_code: z.string().optional(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.post("/api/v1/conversations", {
                recipients: args.recipients,
                body: args.body,
                ...(args.subject ? { subject: args.subject } : {}),
                ...(args.context_code ? { context_code: args.context_code } : {}),
            });
            return jsonResult(result);
        },
    }),
    defineTool({
        name: "canvas_reply_to_conversation",
        description: "Add a reply message to an existing conversation in the authenticated user's inbox.",
        inputSchema: z.object({
            conversation_id: canvasIdSchema,
            body: z.string(),
            recipients: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.post(
                `/api/v1/conversations/${args.conversation_id}/add_message`,
                {
                    body: args.body,
                    ...(args.recipients ? { recipients: args.recipients } : {}),
                },
            );
            return jsonResult(result);
        },
    }),
    defineTool({
        name: "canvas_delete_conversation",
        description: "Delete a conversation from the authenticated user's inbox. This cannot be undone.",
        inputSchema: z.object({
            conversation_id: canvasIdSchema,
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.delete(`/api/v1/conversations/${args.conversation_id}`);
            return jsonResult(result);
        },
    }),

    // educator tools. the hosted profile disables these in src/lib/canvas/mcp.ts
    defineTool({
        name: "canvas_send_bulk_messages",
        description: "Send a message to multiple recipients at once. Requires educator permissions.",
        inputSchema: z.object({
            recipients: z.array(z.string()),
            subject: z.string().optional(),
            body: z.string(),
            context_code: z.string().optional(),
            bulk_message: z.boolean().optional(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.post("/api/v1/conversations", {
                recipients: args.recipients,
                body: args.body,
                bulk_message: args.bulk_message ?? true,
                ...(args.subject ? { subject: args.subject } : {}),
                ...(args.context_code ? { context_code: args.context_code } : {}),
            });
            return jsonResult(result);
        },
    }),
];
