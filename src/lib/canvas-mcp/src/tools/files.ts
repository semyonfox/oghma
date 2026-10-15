import { z } from "zod";
import { canvasIdSchema } from "./canvas-id.ts";
import type { ToolDef } from "./types.ts";
import { defineTool, jsonResult } from "./types.ts";

export const fileTools: ToolDef[] = [
    defineTool({
        name: "canvas_list_course_files",
        description:
            "List files in a course. Optionally filter by search_term, content_types, or sort order.",
        inputSchema: z.object({
            course_id: canvasIdSchema,
            search_term: z.string().optional(),
            content_types: z.array(z.string()).optional(),
            sort: z.string().optional(),
        }),
        handler: async (args, { canvas }) => {
            const files = await canvas.collectPaginated(`/api/v1/courses/${args.course_id}/files`, {
                per_page: 100,
                ...(args.search_term ? { search_term: args.search_term } : {}),
                ...(args.content_types ? { content_types: args.content_types } : {}),
                ...(args.sort ? { sort: args.sort } : {}),
            });
            return jsonResult(files);
        },
    }),
    defineTool({
        name: "canvas_list_folders",
        description: "List all folders in a course.",
        inputSchema: z.object({
            course_id: canvasIdSchema,
        }),
        handler: async (args, { canvas }) => {
            const folders = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/folders`,
                { per_page: 100 },
            );
            return jsonResult(folders);
        },
    }),
    defineTool({
        name: "canvas_list_folder_files",
        description: "List files inside a specific folder by folder ID.",
        inputSchema: z.object({
            folder_id: canvasIdSchema,
        }),
        handler: async (args, { canvas }) => {
            const files = await canvas.collectPaginated(`/api/v1/folders/${args.folder_id}/files`, {
                per_page: 100,
            });
            return jsonResult(files);
        },
    }),
    defineTool({
        name: "canvas_get_file",
        description:
            "Get metadata for a single file by ID. Optionally include user and usage_rights.",
        inputSchema: z.object({
            file_id: canvasIdSchema,
            include: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            const file = await canvas.get(`/api/v1/files/${args.file_id}`, {
                ...(args.include ? { include: args.include } : {}),
            });
            return jsonResult(file);
        },
    }),
    defineTool({
        name: "canvas_get_file_download_url",
        description:
            "Get the pre-authenticated download URL for a file. Returns the url field from the file metadata.",
        inputSchema: z.object({
            file_id: canvasIdSchema,
        }),
        handler: async (args, { canvas }) => {
            const file = await canvas.get<{ url?: unknown }>(`/api/v1/files/${args.file_id}`, {});
            return jsonResult({ url: typeof file.url === "string" ? file.url : null });
        },
    }),

    // educator tools. the hosted profile disables these in src/lib/canvas/mcp.ts
    defineTool({
        name: "canvas_delete_file",
        description: "Delete a file by ID. Requires educator permissions.",
        inputSchema: z.object({
            file_id: canvasIdSchema,
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.delete(`/api/v1/files/${args.file_id}`);
            return jsonResult(result);
        },
    }),
];
