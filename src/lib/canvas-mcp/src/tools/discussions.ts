import { z } from "zod";
import type { ToolDef } from "./types";
import { jsonResult } from "./types";

export const discussionTools: ToolDef[] = [
    {
        name: "canvas_list_discussion_topics",
        description:
            "List discussion topics for a course. Excludes announcements by default. Optionally filter by search_term or include extra fields.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            only_announcements: z.boolean().optional(),
            search_term: z.string().optional(),
            include: z.array(z.string()).optional(),
        }),
        handler: async (args: any, { canvas }) => {
            const topics = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/discussion_topics`,
                {
                    per_page: 100,
                    ...(args.only_announcements !== undefined
                        ? { only_announcements: args.only_announcements }
                        : {}),
                    ...(args.search_term ? { search_term: args.search_term } : {}),
                    ...(args.include ? { include: args.include } : {}),
                },
            );
            return jsonResult(topics);
        },
    },
    {
        name: "canvas_get_discussion_topic",
        description: "Get full details for a single discussion topic by ID within a course.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            topic_id: z.number().int().positive(),
            include: z.array(z.string()).optional(),
        }),
        handler: async (args: any, { canvas }) => {
            const topic = await canvas.get(
                `/api/v1/courses/${args.course_id}/discussion_topics/${args.topic_id}`,
                {
                    ...(args.include ? { include: args.include } : {}),
                },
            );
            return jsonResult(topic);
        },
    },
    {
        name: "canvas_get_discussion_view",
        description:
            "Get the full threaded view of a discussion topic including all replies and participants.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            topic_id: z.number().int().positive(),
        }),
        handler: async (args: any, { canvas }) => {
            const view = await canvas.get(
                `/api/v1/courses/${args.course_id}/discussion_topics/${args.topic_id}/view`,
                {},
            );
            return jsonResult(view);
        },
    },
    {
        name: "canvas_list_discussion_entries",
        description: "List top-level entries (posts) for a discussion topic. Paginated.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            topic_id: z.number().int().positive(),
        }),
        handler: async (args: any, { canvas }) => {
            const entries = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/discussion_topics/${args.topic_id}/entries`,
                { per_page: 100 },
            );
            return jsonResult(entries);
        },
    },
    {
        name: "canvas_get_discussion_entry",
        description: "Get a single discussion entry by ID within a topic.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            topic_id: z.number().int().positive(),
            entry_id: z.number().int().positive(),
        }),
        handler: async (args: any, { canvas }) => {
            const entry = await canvas.get(
                `/api/v1/courses/${args.course_id}/discussion_topics/${args.topic_id}/entries/${args.entry_id}`,
                {},
            );
            return jsonResult(entry);
        },
    },

    // ============================================================
    // ADMIN / EDUCATOR TOOLS — commented out for student-only build.
    // Uncomment to enable discussion topic creation, posting, and deletion.
    // ============================================================
    {
        name: "canvas_create_discussion_topic",
        description: "Create a new discussion topic in a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            title: z.string(),
            message: z.string(),
            discussion_type: z.enum(["side_comment", "threaded"]).optional(),
        }),
        handler: async (args: any, { canvas }) => {
            const topic = await canvas.post(
                `/api/v1/courses/${args.course_id}/discussion_topics`,
                {
                    title: args.title,
                    message: args.message,
                    ...(args.discussion_type ? { discussion_type: args.discussion_type } : {}),
                },
            );
            return jsonResult(topic);
        },
    },
    {
        name: "canvas_post_discussion_entry",
        description: "Post a top-level reply to a discussion topic. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            topic_id: z.number().int().positive(),
            message: z.string(),
        }),
        handler: async (args: any, { canvas }) => {
            const entry = await canvas.post(
                `/api/v1/courses/${args.course_id}/discussion_topics/${args.topic_id}/entries`,
                { message: args.message },
            );
            return jsonResult(entry);
        },
    },
    {
        name: "canvas_reply_to_discussion_entry",
        description: "Reply to an existing discussion entry. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            topic_id: z.number().int().positive(),
            entry_id: z.number().int().positive(),
            message: z.string(),
        }),
        handler: async (args: any, { canvas }) => {
            const reply = await canvas.post(
                `/api/v1/courses/${args.course_id}/discussion_topics/${args.topic_id}/entries/${args.entry_id}/replies`,
                { message: args.message },
            );
            return jsonResult(reply);
        },
    },
    {
        name: "canvas_delete_discussion_topic",
        description: "Delete a discussion topic from a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            topic_id: z.number().int().positive(),
        }),
        handler: async (args: any, { canvas }) => {
            const result = await canvas.delete(
                `/api/v1/courses/${args.course_id}/discussion_topics/${args.topic_id}`,
            );
            return jsonResult(result);
        },
    },
];
