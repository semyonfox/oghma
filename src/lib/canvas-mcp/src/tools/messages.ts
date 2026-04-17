import { z } from "zod";
import type { ToolDef } from "./types.ts";
import { jsonResult } from "./types.ts";

export const messageTools: ToolDef[] = [
    {
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
    },
    {
        name: "canvas_get_conversation",
        description: "Get full details for a single conversation by ID.",
        inputSchema: z.object({
            conversation_id: z.number().int().positive(),
            include: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            const conversation = await canvas.get(`/api/v1/conversations/${args.conversation_id}`, {
                ...(args.include ? { include: args.include } : {}),
            });
            return jsonResult(conversation);
        },
    },
    {
        name: "canvas_get_unread_count",
        description: "Get the number of unread conversations in the authenticated user's inbox.",
        inputSchema: z.object({}),
        handler: async (_args, { canvas }) => {
            const result = await canvas.get("/api/v1/conversations/unread_count", {});
            return jsonResult(result);
        },
    },
    {
        name: "canvas_mark_conversation_read",
        description:
            "Mark a conversation as read (or set another workflow_state). Safe self-state toggle only.",
        inputSchema: z.object({
            conversation_id: z.number().int().positive(),
            workflow_state: z.enum(["read", "unread", "archived"]).optional(),
        }),
        handler: async (args, { canvas }) => {
            const state = args.workflow_state ?? "read";
            const result = await canvas.put(`/api/v1/conversations/${args.conversation_id}`, {
                conversation: { workflow_state: state },
            });
            return jsonResult(result);
        },
    },

    // ============================================================
    // ADMIN / EDUCATOR TOOLS — commented out for student-only build.
    // Uncomment to enable sending, replying, bulk messaging, and deletion.
    // ============================================================
    {
        name: "canvas_send_conversation",
        description: "Send a new conversation (message) to one or more recipients. Requires educator permissions.",
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
    },
    {
        name: "canvas_reply_to_conversation",
        description: "Add a reply message to an existing conversation. Requires educator permissions.",
        inputSchema: z.object({
            conversation_id: z.number().int().positive(),
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
    },
    {
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
    },
    {
        name: "canvas_delete_conversation",
        description: "Delete a conversation by ID. Requires educator permissions.",
        inputSchema: z.object({
            conversation_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.delete(`/api/v1/conversations/${args.conversation_id}`);
            return jsonResult(result);
        },
    },
];
