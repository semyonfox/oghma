import { z } from "zod";
import type { ToolDef } from "./types.ts";
import { jsonResult } from "./types.ts";

export const moduleTools: ToolDef[] = [
    {
        name: "canvas_list_modules",
        description:
            "List modules for a course. Optionally include items and content_details via include[].",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            include: z.array(z.string()).optional(),
            search_term: z.string().optional(),
        }),
        handler: async (args, { canvas }) => {
            const modules = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/modules`,
                {
                    per_page: 100,
                    ...(args.include ? { include: args.include } : {}),
                    ...(args.search_term ? { search_term: args.search_term } : {}),
                },
            );
            return jsonResult(modules);
        },
    },
    {
        name: "canvas_get_module",
        description: "Get details for a single module by course and module ID.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            module_id: z.number().int().positive(),
            include: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            const module_ = await canvas.get(
                `/api/v1/courses/${args.course_id}/modules/${args.module_id}`,
                {
                    ...(args.include ? { include: args.include } : {}),
                },
            );
            return jsonResult(module_);
        },
    },
    {
        name: "canvas_list_module_items",
        description:
            "List items within a module. Optionally include content_details via include[].",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            module_id: z.number().int().positive(),
            include: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            const items = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/modules/${args.module_id}/items`,
                {
                    per_page: 100,
                    ...(args.include ? { include: args.include } : {}),
                },
            );
            return jsonResult(items);
        },
    },
    {
        name: "canvas_get_module_item",
        description: "Get a single module item by course, module, and item ID.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            module_id: z.number().int().positive(),
            item_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const item = await canvas.get(
                `/api/v1/courses/${args.course_id}/modules/${args.module_id}/items/${args.item_id}`,
                {},
            );
            return jsonResult(item);
        },
    },
    {
        name: "canvas_get_module_item_sequence",
        description:
            "Get the module item sequence (next/prev navigation) for a given asset in a course.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            asset_type: z.string(),
            asset_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const sequence = await canvas.get(
                `/api/v1/courses/${args.course_id}/module_item_sequence`,
                {
                    asset_type: args.asset_type,
                    asset_id: args.asset_id,
                },
            );
            return jsonResult(sequence);
        },
    },
    {
        name: "canvas_mark_module_item_read",
        description:
            "Mark a module item as read for the authenticated student. Safe progress side-effect only.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            module_id: z.number().int().positive(),
            item_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.post(
                `/api/v1/courses/${args.course_id}/modules/${args.module_id}/items/${args.item_id}/mark_read`,
            );
            return jsonResult(result);
        },
    },
    {
        name: "canvas_mark_module_item_done",
        description:
            "Mark a module item as done for the authenticated student. Safe progress side-effect only.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            module_id: z.number().int().positive(),
            item_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.put(
                `/api/v1/courses/${args.course_id}/modules/${args.module_id}/items/${args.item_id}/done`,
            );
            return jsonResult(result);
        },
    },

    // ============================================================
    // ADMIN / EDUCATOR TOOLS — commented out for student-only build.
    // Uncomment to enable module creation, updates, deletion,
    // item management, and publish toggling.
    // ============================================================
    {
        name: "canvas_create_module",
        description: "Create a new module in a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            name: z.string(),
            position: z.number().int().positive().optional(),
            unlock_at: z.string().optional(),
        }),
        handler: async (args, { canvas }) => {
            const module_ = await canvas.post(
                `/api/v1/courses/${args.course_id}/modules`,
                {
                    module: {
                        name: args.name,
                        ...(args.position !== undefined ? { position: args.position } : {}),
                        ...(args.unlock_at !== undefined ? { unlock_at: args.unlock_at } : {}),
                    },
                },
            );
            return jsonResult(module_);
        },
    },
    {
        name: "canvas_update_module",
        description: "Update a module in a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            module_id: z.number().int().positive(),
            name: z.string().optional(),
            position: z.number().int().positive().optional(),
            published: z.boolean().optional(),
        }),
        handler: async (args, { canvas }) => {
            const module_ = await canvas.put(
                `/api/v1/courses/${args.course_id}/modules/${args.module_id}`,
                {
                    module: {
                        ...(args.name !== undefined ? { name: args.name } : {}),
                        ...(args.position !== undefined ? { position: args.position } : {}),
                        ...(args.published !== undefined ? { published: args.published } : {}),
                    },
                },
            );
            return jsonResult(module_);
        },
    },
    {
        name: "canvas_delete_module",
        description: "Delete a module from a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            module_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.delete(
                `/api/v1/courses/${args.course_id}/modules/${args.module_id}`,
            );
            return jsonResult(result);
        },
    },
    {
        name: "canvas_add_module_item",
        description: "Add an item to a module. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            module_id: z.number().int().positive(),
            type: z.string(),
            content_id: z.number().int().positive().optional(),
            title: z.string().optional(),
            position: z.number().int().positive().optional(),
        }),
        handler: async (args, { canvas }) => {
            const item = await canvas.post(
                `/api/v1/courses/${args.course_id}/modules/${args.module_id}/items`,
                {
                    module_item: {
                        type: args.type,
                        ...(args.content_id !== undefined ? { content_id: args.content_id } : {}),
                        ...(args.title !== undefined ? { title: args.title } : {}),
                        ...(args.position !== undefined ? { position: args.position } : {}),
                    },
                },
            );
            return jsonResult(item);
        },
    },
    {
        name: "canvas_update_module_item",
        description: "Update a module item. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            module_id: z.number().int().positive(),
            item_id: z.number().int().positive(),
            title: z.string().optional(),
            position: z.number().int().positive().optional(),
            published: z.boolean().optional(),
        }),
        handler: async (args, { canvas }) => {
            const item = await canvas.put(
                `/api/v1/courses/${args.course_id}/modules/${args.module_id}/items/${args.item_id}`,
                {
                    module_item: {
                        ...(args.title !== undefined ? { title: args.title } : {}),
                        ...(args.position !== undefined ? { position: args.position } : {}),
                        ...(args.published !== undefined ? { published: args.published } : {}),
                    },
                },
            );
            return jsonResult(item);
        },
    },
    {
        name: "canvas_delete_module_item",
        description: "Delete an item from a module. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            module_id: z.number().int().positive(),
            item_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.delete(
                `/api/v1/courses/${args.course_id}/modules/${args.module_id}/items/${args.item_id}`,
            );
            return jsonResult(result);
        },
    },
    {
        name: "canvas_toggle_module_publish",
        description: "Publish or unpublish a module. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            module_id: z.number().int().positive(),
            published: z.boolean(),
        }),
        handler: async (args, { canvas }) => {
            const module_ = await canvas.put(
                `/api/v1/courses/${args.course_id}/modules/${args.module_id}`,
                { module: { published: args.published } },
            );
            return jsonResult(module_);
        },
    },
];
