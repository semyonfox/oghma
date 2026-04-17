import { z } from "zod";
import type { ToolDef } from "./types";
import { jsonResult } from "./types";

export const calendarTools: ToolDef[] = [
    {
        name: "canvas_list_calendar_events",
        description:
            "List calendar events for the authenticated user. Filter by context_codes (e.g. course_123), date range, and type (event or assignment).",
        inputSchema: z.object({
            context_codes: z.array(z.string()).optional(),
            start_date: z.string().optional(),
            end_date: z.string().optional(),
            type: z.enum(["event", "assignment"]).optional(),
        }),
        handler: async (args, { canvas }) => {
            const events = await canvas.collectPaginated("/api/v1/calendar_events", {
                per_page: 100,
                ...(args.context_codes ? { context_codes: args.context_codes } : {}),
                ...(args.start_date ? { start_date: args.start_date } : {}),
                ...(args.end_date ? { end_date: args.end_date } : {}),
                ...(args.type ? { type: args.type } : {}),
            });
            return jsonResult(events);
        },
    },
    {
        name: "canvas_list_upcoming_events",
        description:
            "List the authenticated user's upcoming items (next ~14 days). Canvas returns assignments with due dates AND calendar events in one merged list. Optional client-side filters: type (assignment|event), days (truncate to next N days), limit (cap result count). Use this for 'what's due', 'what's coming up', 'this week' questions.",
        inputSchema: z.object({
            type: z.enum(["assignment", "event"]).optional(),
            days: z.number().int().positive().optional(),
            limit: z.number().int().positive().optional(),
        }),
        handler: async (args, { canvas }) => {
            const events = await canvas.get<Array<Record<string, unknown>>>(
                "/api/v1/users/self/upcoming_events",
            );
            let filtered = events;
            if (args.type) {
                filtered = filtered.filter((e) => e["type"] === args.type);
            }
            if (args.days !== undefined) {
                const cutoff = Date.now() + args.days * 86_400_000;
                filtered = filtered.filter((e) => {
                    const when = (e["end_at"] ?? e["start_at"] ?? e["due_at"]) as string | undefined;
                    if (!when) return true;
                    const t = Date.parse(when);
                    return Number.isNaN(t) ? true : t <= cutoff;
                });
            }
            if (args.limit !== undefined) {
                filtered = filtered.slice(0, args.limit);
            }
            return jsonResult(filtered);
        },
    },
    {
        name: "canvas_list_planner_items",
        description:
            "List planner items for the authenticated student. Optionally filter by date range or context_codes (e.g. course_123).",
        inputSchema: z.object({
            start_date: z.string().optional(),
            end_date: z.string().optional(),
            context_codes: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            const items = await canvas.collectPaginated("/api/v1/planner/items", {
                per_page: 100,
                ...(args.start_date ? { start_date: args.start_date } : {}),
                ...(args.end_date ? { end_date: args.end_date } : {}),
                ...(args.context_codes ? { context_codes: args.context_codes } : {}),
            });
            return jsonResult(items);
        },
    },
    {
        name: "canvas_list_todo_items",
        description:
            "List todo items for the authenticated user (assignments to submit, items to review, etc.).",
        inputSchema: z.object({}),
        handler: async (_args, { canvas }) => {
            const todos = await canvas.get("/api/v1/users/self/todo", {});
            return jsonResult(todos);
        },
    },

    // ============================================================
    // ADMIN / EDUCATOR TOOLS — commented out for student-only build.
    // Uncomment to enable calendar event creation, updates, deletion,
    // planner note management, and planner override marking.
    // ============================================================
    {
        name: "canvas_create_calendar_event",
        description: "Create a calendar event. Requires educator permissions.",
        inputSchema: z.object({
            context_code: z.string(),
            title: z.string(),
            start_at: z.string().optional(),
            end_at: z.string().optional(),
            description: z.string().optional(),
            location_name: z.string().optional(),
        }),
        handler: async (args, { canvas }) => {
            const event = await canvas.post("/api/v1/calendar_events", {
                calendar_event: {
                    context_code: args.context_code,
                    title: args.title,
                    ...(args.start_at ? { start_at: args.start_at } : {}),
                    ...(args.end_at ? { end_at: args.end_at } : {}),
                    ...(args.description ? { description: args.description } : {}),
                    ...(args.location_name ? { location_name: args.location_name } : {}),
                },
            });
            return jsonResult(event);
        },
    },
    {
        name: "canvas_update_calendar_event",
        description: "Update a calendar event. Requires educator permissions.",
        inputSchema: z.object({
            event_id: z.number().int().positive(),
            title: z.string().optional(),
            start_at: z.string().optional(),
            end_at: z.string().optional(),
            description: z.string().optional(),
        }),
        handler: async (args, { canvas }) => {
            const event = await canvas.put(`/api/v1/calendar_events/${args.event_id}`, {
                calendar_event: {
                    ...(args.title ? { title: args.title } : {}),
                    ...(args.start_at ? { start_at: args.start_at } : {}),
                    ...(args.end_at ? { end_at: args.end_at } : {}),
                    ...(args.description ? { description: args.description } : {}),
                },
            });
            return jsonResult(event);
        },
    },
    {
        name: "canvas_delete_calendar_event",
        description: "Delete a calendar event. Requires educator permissions.",
        inputSchema: z.object({
            event_id: z.number().int().positive(),
            cancel_reason: z.string().optional(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.delete(`/api/v1/calendar_events/${args.event_id}`);
            return jsonResult(result);
        },
    },
    {
        name: "canvas_create_planner_note",
        description: "Create a planner note. Requires educator permissions.",
        inputSchema: z.object({
            title: z.string(),
            details: z.string().optional(),
            todo_date: z.string().optional(),
            course_id: z.number().int().positive().optional(),
        }),
        handler: async (args, { canvas }) => {
            const note = await canvas.post("/api/v1/planner_notes", {
                title: args.title,
                ...(args.details ? { details: args.details } : {}),
                ...(args.todo_date ? { todo_date: args.todo_date } : {}),
                ...(args.course_id !== undefined ? { course_id: args.course_id } : {}),
            });
            return jsonResult(note);
        },
    },
    {
        name: "canvas_update_planner_note",
        description: "Update a planner note. Requires educator permissions.",
        inputSchema: z.object({
            note_id: z.number().int().positive(),
            title: z.string().optional(),
            details: z.string().optional(),
            todo_date: z.string().optional(),
        }),
        handler: async (args, { canvas }) => {
            const note = await canvas.put(`/api/v1/planner_notes/${args.note_id}`, {
                ...(args.title ? { title: args.title } : {}),
                ...(args.details ? { details: args.details } : {}),
                ...(args.todo_date ? { todo_date: args.todo_date } : {}),
            });
            return jsonResult(note);
        },
    },
    {
        name: "canvas_delete_planner_note",
        description: "Delete a planner note. Requires educator permissions.",
        inputSchema: z.object({
            note_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.delete(`/api/v1/planner_notes/${args.note_id}`);
            return jsonResult(result);
        },
    },
    {
        name: "canvas_mark_planner_item_complete",
        description: "Mark a planner override item as complete. Requires educator permissions.",
        inputSchema: z.object({
            override_id: z.number().int().positive(),
            marked_complete: z.boolean(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.put(`/api/v1/planner/overrides/${args.override_id}`, {
                marked_complete: args.marked_complete,
            });
            return jsonResult(result);
        },
    },
];
