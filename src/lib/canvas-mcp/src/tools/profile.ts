import { z } from "zod";
import { canvasIdSchema } from "./canvas-id.ts";
import type { ToolDef } from "./types.ts";
import { defineTool, jsonResult } from "./types.ts";

export const profileTools: ToolDef[] = [
    defineTool({
        name: "canvas_get_my_profile",
        description: "Get the profile of the authenticated user.",
        inputSchema: z.object({}),
        handler: async (_args, { canvas }) => {
            const profile = await canvas.get("/api/v1/users/self/profile", {});
            return jsonResult(profile);
        },
    }),
    defineTool({
        name: "canvas_get_user_profile",
        description:
            "Get the profile of a user by ID. Students can fetch visible profiles of users in shared courses.",
        inputSchema: z.object({
            user_id: canvasIdSchema,
        }),
        handler: async (args, { canvas }) => {
            const profile = await canvas.get(`/api/v1/users/${args.user_id}/profile`, {});
            return jsonResult(profile);
        },
    }),
    defineTool({
        name: "canvas_get_my_settings",
        description: "Get the settings for the authenticated user.",
        inputSchema: z.object({}),
        handler: async (_args, { canvas }) => {
            const settings = await canvas.get("/api/v1/users/self/settings", {});
            return jsonResult(settings);
        },
    }),

    defineTool({
        name: "canvas_update_user_profile",
        description: "Update a user's name, short name or bio. Students can usually only edit their own profile, if the institution allows it.",
        inputSchema: z.object({
            user_id: canvasIdSchema,
            name: z.string().optional(),
            short_name: z.string().optional(),
            bio: z.string().optional(),
        }),
        handler: async (args, { canvas }) => {
            const { user_id, ...fields } = args;
            const result = await canvas.put(`/api/v1/users/${user_id}`, { user: fields });
            return jsonResult(result);
        },
    }),
    defineTool({
        name: "canvas_update_my_settings",
        description: "Update display settings for the authenticated user.",
        inputSchema: z.object({
            manual_mark_as_read: z.boolean().optional(),
            collapse_global_nav: z.boolean().optional(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.put("/api/v1/users/self/settings", args);
            return jsonResult(result);
        },
    }),
    // admin tools. the hosted profile disables these in src/lib/canvas/mcp.ts
    defineTool({
        name: "canvas_create_user",
        description: "Create a new user in an account. Requires admin permissions.",
        inputSchema: z.object({
            account_id: canvasIdSchema,
            name: z.string(),
            login_id: z.string(),
        }),
        handler: async (args, { canvas }) => {
            const { account_id, ...fields } = args;
            const result = await canvas.post(`/api/v1/accounts/${account_id}/users`, {
                user: { name: fields.name },
                pseudonym: { unique_id: fields.login_id },
            });
            return jsonResult(result);
        },
    }),
];
