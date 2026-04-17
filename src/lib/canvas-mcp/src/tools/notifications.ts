import { z } from "zod";
import type { ToolDef } from "./types";
import { jsonResult } from "./types";

// note: canvas_list_account_notifications is already defined in announcements.ts —
// skipped here to avoid duplicate tool name registration.

export const notificationTools: ToolDef[] = [
    {
        name: "canvas_list_activity_stream",
        description:
            "List the activity stream for the authenticated user. Consolidates announcements, discussions, submissions, and conversations. Optionally restrict to active courses only.",
        inputSchema: z.object({
            only_active_courses: z.boolean().optional(),
        }),
        handler: async (args, { canvas }) => {
            const stream = await canvas.collectPaginated("/api/v1/users/self/activity_stream", {
                per_page: 100,
                ...(args.only_active_courses !== undefined
                    ? { only_active_courses: args.only_active_courses }
                    : {}),
            });
            return jsonResult(stream);
        },
    },
    {
        name: "canvas_get_activity_stream_summary",
        description:
            "Get a summary of the current user's activity stream, grouped by type with unread counts.",
        inputSchema: z.object({}),
        handler: async (_args, { canvas }) => {
            const summary = await canvas.get("/api/v1/users/self/activity_stream/summary", {});
            return jsonResult(summary);
        },
    },
    {
        name: "canvas_list_communication_channels",
        description:
            "List communication channels (email, push, SMS) for the authenticated user. Useful for interpreting notification delivery preferences.",
        inputSchema: z.object({}),
        handler: async (_args, { canvas }) => {
            const channels = await canvas.get("/api/v1/users/self/communication_channels", {});
            return jsonResult(channels);
        },
    },

    // ============================================================
    // ADMIN / EDUCATOR TOOLS — commented out for student-only build.
    // Uncomment to enable notification dismissal and preference updates.
    // ============================================================
    {
        name: "canvas_dismiss_account_notification",
        description: "Dismiss an account-level notification banner by ID. Requires educator permissions.",
        inputSchema: z.object({
            notification_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.delete(
                `/api/v1/accounts/self/account_notifications/${args.notification_id}`,
            );
            return jsonResult(result);
        },
    },
    {
        name: "canvas_update_notification_preference",
        description:
            "Update a notification preference for a specific communication channel. Requires educator permissions.",
        inputSchema: z.object({
            channel_id: z.number().int().positive(),
            notification: z.string(),
            frequency: z.enum(["immediately", "daily", "weekly", "never"]),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.put(
                `/api/v1/users/self/communication_channels/${args.channel_id}/notification_preferences/${args.notification}`,
                { notification_preferences: { frequency: args.frequency } },
            );
            return jsonResult(result);
        },
    },
];
