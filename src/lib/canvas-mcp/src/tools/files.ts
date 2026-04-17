import { z } from "zod";
import type { ToolDef } from "./types";
import { jsonResult, textResult } from "./types";

export const fileTools: ToolDef[] = [
    {
        name: "canvas_list_course_files",
        description:
            "List files in a course. Optionally filter by search_term, content_types, or sort order.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
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
    },
    {
        name: "canvas_list_folders",
        description: "List all folders in a course.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const folders = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/folders`,
                { per_page: 100 },
            );
            return jsonResult(folders);
        },
    },
    {
        name: "canvas_list_folder_files",
        description: "List files inside a specific folder by folder ID.",
        inputSchema: z.object({
            folder_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const files = await canvas.collectPaginated(`/api/v1/folders/${args.folder_id}/files`, {
                per_page: 100,
            });
            return jsonResult(files);
        },
    },
    {
        name: "canvas_get_file",
        description:
            "Get metadata for a single file by ID. Optionally include user and usage_rights.",
        inputSchema: z.object({
            file_id: z.number().int().positive(),
            include: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            const file = await canvas.get(`/api/v1/files/${args.file_id}`, {
                ...(args.include ? { include: args.include } : {}),
            });
            return jsonResult(file);
        },
    },
    {
        name: "canvas_get_file_download_url",
        description:
            "Get the pre-authenticated download URL for a file. Returns the url field from the file metadata.",
        inputSchema: z.object({
            file_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const file = await canvas.get(`/api/v1/files/${args.file_id}`, {});
            return jsonResult({ url: (file as { url: string }).url });
        },
    },

    // ============================================================
    // ADMIN / EDUCATOR TOOLS
    // ============================================================
    {
        name: "canvas_upload_file",
        // stub — Canvas file upload is a 3-step flow that cannot be driven
        // through a single API call; full implementation requires the caller
        // to handle the multipart upload outside this server.
        //
        // Canvas upload procedure (https://canvas.instructure.com/doc/api/file.file_uploads.html):
        //   Step 1 — POST /api/v1/courses/:id/files  → receive upload_url + upload_params
        //   Step 2 — POST upload_url with upload_params + file bytes (multipart/form-data)
        //   Step 3 — follow the redirect (or confirm via POST) to finalize the file object
        description:
            "[STUB] Upload a file to a course. " +
            "Canvas requires a 3-step upload flow that this tool cannot fully execute server-side: " +
            "(1) POST /api/v1/courses/:id/files to get upload_url + upload_params, " +
            "(2) POST the file bytes to upload_url with upload_params as multipart/form-data, " +
            "(3) confirm the upload by following the redirect or POSTing to the confirmation URL. " +
            "See https://canvas.instructure.com/doc/api/file.file_uploads.html for the full spec. " +
            "Requires educator/admin permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            name: z.string(),
            size: z.number().int().positive(),
            content_type: z.string().optional(),
            parent_folder_path: z.string().optional(),
        }),
        handler: async (args) => {
            return textResult(
                JSON.stringify(
                    {
                        stub: true,
                        message:
                            "canvas_upload_file is not fully implemented. " +
                            "Canvas file upload is a 3-step flow: " +
                            "(1) POST /api/v1/courses/:id/files to obtain upload_url and upload_params, " +
                            "(2) POST the file bytes to upload_url as multipart/form-data including all upload_params, " +
                            "(3) confirm by following the redirect or POSTing to the confirmation URL. " +
                            "Docs: https://canvas.instructure.com/doc/api/file.file_uploads.html",
                        requested_params: {
                            course_id: args.course_id,
                            name: args.name,
                            size: args.size,
                            content_type: args.content_type,
                            parent_folder_path: args.parent_folder_path,
                        },
                    },
                    null,
                    2,
                ),
            );
        },
    },
    {
        name: "canvas_delete_file",
        description: "Delete a file by ID. Requires educator permissions.",
        inputSchema: z.object({
            file_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.delete(`/api/v1/files/${args.file_id}`);
            return jsonResult(result);
        },
    },
    {
        name: "canvas_download_file_to_disk",
        // thin wrapper — server-side filesystem write is not safe in this
        // deployment; returns the pre-authenticated download URL instead,
        // which is identical to what canvas_get_file_download_url provides
        description:
            "[THIN WRAPPER] Returns the pre-authenticated download URL for the given file. " +
            "Server-side filesystem writes are not supported in this deployment. " +
            "The caller can use the returned url to stream or save the file client-side. " +
            "destination_path is accepted but ignored. " +
            "Equivalent to canvas_get_file_download_url.",
        inputSchema: z.object({
            file_id: z.number().int().positive(),
            destination_path: z.string(),
        }),
        handler: async (args, { canvas }) => {
            const file = await canvas.get(`/api/v1/files/${args.file_id}`, {});
            const url = (file as { url: string }).url;
            return textResult(
                JSON.stringify(
                    {
                        note:
                            "Server-side filesystem download is not supported. " +
                            "Use the url below to download the file client-side.",
                        url,
                        destination_path_ignored: args.destination_path,
                    },
                    null,
                    2,
                ),
            );
        },
    },
];
