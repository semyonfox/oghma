import { z } from "zod";
import type { ToolDef } from "./types.ts";
import { jsonResult } from "./types.ts";

export const pageTools: ToolDef[] = [
    {
        name: "canvas_list_pages",
        description:
            "List pages for a course. Optionally sort by title/created_at/updated_at, filter by search_term, or filter by published state.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            sort: z.enum(["title", "created_at", "updated_at"]).optional(),
            search_term: z.string().optional(),
            published: z.boolean().optional(),
        }),
        handler: async (args, { canvas }) => {
            const pages = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/pages`,
                {
                    per_page: 100,
                    ...(args.sort ? { sort: args.sort } : {}),
                    ...(args.search_term ? { search_term: args.search_term } : {}),
                    ...(args.published !== undefined ? { published: args.published } : {}),
                },
            );
            return jsonResult(pages);
        },
    },
    {
        name: "canvas_get_page",
        description:
            "Get a single page by its URL slug. Returns the full page including HTML body content.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            page_url: z.string().min(1),
        }),
        handler: async (args, { canvas }) => {
            const page = await canvas.get(
                `/api/v1/courses/${args.course_id}/pages/${args.page_url}`,
                {},
            );
            return jsonResult(page);
        },
    },
    {
        name: "canvas_get_front_page",
        description: "Get the front page for a course.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const page = await canvas.get(
                `/api/v1/courses/${args.course_id}/front_page`,
                {},
            );
            return jsonResult(page);
        },
    },
    {
        name: "canvas_list_page_revisions",
        description: "List revision history for a page identified by its URL slug.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            page_url: z.string().min(1),
        }),
        handler: async (args, { canvas }) => {
            const revisions = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/pages/${args.page_url}/revisions`,
                { per_page: 100 },
            );
            return jsonResult(revisions);
        },
    },
    {
        name: "canvas_get_page_revision",
        description:
            "Get a specific revision of a page by revision ID. Pass summary=true to get a lightweight response without body HTML.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            page_url: z.string().min(1),
            revision_id: z.number().int().positive(),
            summary: z.boolean().optional(),
        }),
        handler: async (args, { canvas }) => {
            const revision = await canvas.get(
                `/api/v1/courses/${args.course_id}/pages/${args.page_url}/revisions/${args.revision_id}`,
                {
                    ...(args.summary !== undefined ? { summary: args.summary } : {}),
                },
            );
            return jsonResult(revision);
        },
    },

    // ============================================================
    // ADMIN / EDUCATOR TOOLS — commented out for student-only build.
    // Uncomment to enable page creation, updates, deletion,
    // and revision reversion.
    // ============================================================
    {
        name: "canvas_create_page",
        description: "Create a new page in a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            title: z.string(),
            body: z.string().optional(),
            published: z.boolean().optional(),
            front_page: z.boolean().optional(),
        }),
        handler: async (args, { canvas }) => {
            const page = await canvas.post(
                `/api/v1/courses/${args.course_id}/pages`,
                {
                    wiki_page: {
                        title: args.title,
                        ...(args.body !== undefined ? { body: args.body } : {}),
                        ...(args.published !== undefined ? { published: args.published } : {}),
                        ...(args.front_page !== undefined ? { front_page: args.front_page } : {}),
                    },
                },
            );
            return jsonResult(page);
        },
    },
    {
        name: "canvas_update_page",
        description: "Update an existing page. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            page_url: z.string().min(1),
            title: z.string().optional(),
            body: z.string().optional(),
            published: z.boolean().optional(),
            front_page: z.boolean().optional(),
        }),
        handler: async (args, { canvas }) => {
            const page = await canvas.put(
                `/api/v1/courses/${args.course_id}/pages/${args.page_url}`,
                {
                    wiki_page: {
                        ...(args.title !== undefined ? { title: args.title } : {}),
                        ...(args.body !== undefined ? { body: args.body } : {}),
                        ...(args.published !== undefined ? { published: args.published } : {}),
                        ...(args.front_page !== undefined ? { front_page: args.front_page } : {}),
                    },
                },
            );
            return jsonResult(page);
        },
    },
    {
        name: "canvas_delete_page",
        description: "Delete a page from a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            page_url: z.string().min(1),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.delete(
                `/api/v1/courses/${args.course_id}/pages/${args.page_url}`,
            );
            return jsonResult(result);
        },
    },
    {
        name: "canvas_revert_page_revision",
        description: "Revert a page to a specific revision. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            page_url: z.string().min(1),
            revision_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const revision = await canvas.post(
                `/api/v1/courses/${args.course_id}/pages/${args.page_url}/revisions/${args.revision_id}`,
            );
            return jsonResult(revision);
        },
    },
];
