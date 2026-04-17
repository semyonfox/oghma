import { z } from "zod";
import type { ToolDef } from "./types";
import { jsonResult } from "./types";

const listAnnouncementsSchema = z.object({
  context_codes: z.array(z.string()),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  active_only: z.boolean().optional(),
});

export const announcementTools: ToolDef[] = [
  {
    name: "canvas_list_announcements",
    description:
      "List announcements across one or more courses. context_codes is required (e.g. ['course_123']). Optionally filter by date range or active_only.",
    inputSchema: listAnnouncementsSchema,
    handler: async (args: any, { canvas }) => {
      const announcements = await canvas.collectPaginated(
        "/api/v1/announcements",
        {
          per_page: 100,
          context_codes: args.context_codes,
          ...(args.start_date ? { start_date: args.start_date } : {}),
          ...(args.end_date ? { end_date: args.end_date } : {}),
          ...(args.active_only !== undefined
            ? { active_only: args.active_only }
            : {}),
        },
      );
      return jsonResult(announcements);
    },
  },
  {
    name: "canvas_list_course_announcements",
    description:
      "List announcements for a specific course (backed by discussion_topics?only_announcements=true). Paginated.",
    inputSchema: z.object({
      course_id: z.number().int().positive(),
    }),
    handler: async (args: any, { canvas }) => {
      const announcements = await canvas.collectPaginated(
        `/api/v1/courses/${args.course_id}/discussion_topics`,
        {
          per_page: 100,
          only_announcements: true,
        },
      );
      return jsonResult(announcements);
    },
  },
  {
    name: "canvas_get_announcement",
    description:
      "Get a single announcement by its discussion topic ID within a course. Announcements are discussion topics with is_announcement=true.",
    inputSchema: z.object({
      course_id: z.number().int().positive(),
      announcement_id: z.number().int().positive(),
    }),
    handler: async (args: any, { canvas }) => {
      const announcement = await canvas.get(
        `/api/v1/courses/${args.course_id}/discussion_topics/${args.announcement_id}`,
        {},
      );
      return jsonResult(announcement);
    },
  },
  {
    name: "canvas_list_account_notifications",
    description:
      "List institution-wide account notifications (global banners) for the authenticated user.",
    inputSchema: z.object({}),
    handler: async (_args, { canvas }) => {
      const notifications = await canvas.get(
        "/api/v1/accounts/self/account_notifications",
        {},
      );
      return jsonResult(notifications);
    },
  },

  // ============================================================
  // ADMIN / EDUCATOR TOOLS — uncommented to enable announcement creation and deletion.
  // ============================================================
  {
    name: "canvas_create_announcement",
    description:
      "Create an announcement in a course. Requires educator permissions.",
    inputSchema: z.object({
      course_id: z.number().int().positive(),
      title: z.string(),
      message: z.string(),
      delayed_post_at: z.string().optional(),
    }),
    handler: async (args: any, { canvas }) => {
      const announcement = await canvas.post(
        `/api/v1/courses/${args.course_id}/discussion_topics`,
        {
          is_announcement: true,
          title: args.title,
          message: args.message,
          ...(args.delayed_post_at
            ? { delayed_post_at: args.delayed_post_at }
            : {}),
        },
      );
      return jsonResult(announcement);
    },
  },
  {
    name: "canvas_delete_announcement",
    description:
      "Delete an announcement from a course. Requires educator permissions.",
    inputSchema: z.object({
      course_id: z.number().int().positive(),
      announcement_id: z.number().int().positive(),
    }),
    handler: async (args: any, { canvas }) => {
      const result = await canvas.delete(
        `/api/v1/courses/${args.course_id}/discussion_topics/${args.announcement_id}`,
      );
      return jsonResult(result);
    },
  },
  {
    name: "canvas_bulk_delete_announcements",
    description:
      "Delete multiple announcements from a course. Requires educator permissions.",
    inputSchema: z.object({
      course_id: z.number().int().positive(),
      announcement_ids: z.array(z.number().int().positive()),
    }),
    handler: async (args: any, { canvas }) => {
      const results = await Promise.all(
        args.announcement_ids.map((id: number) =>
          canvas.delete(
            `/api/v1/courses/${args.course_id}/discussion_topics/${id}`,
          ),
        ),
      );
      return jsonResult(results);
    },
  },
];
