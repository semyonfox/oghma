import { z } from "zod";
import type { ToolDef } from "./types";
import { jsonResult } from "./types";

export const assignmentTools: ToolDef[] = [
    {
        name: "canvas_list_assignments",
        description:
            "List assignments for a course, with optional bucket filter (upcoming, overdue, past, etc.) and search.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            bucket: z
                .enum(["past", "overdue", "undated", "ungraded", "unsubmitted", "upcoming", "future"])
                .optional(),
            include: z.array(z.string()).optional(),
            search_term: z.string().optional(),
        }),
        handler: async (args, { canvas }) => {
            const assignments = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/assignments`,
                {
                    per_page: 100,
                    ...(args.bucket ? { bucket: args.bucket } : {}),
                    ...(args.include ? { include: args.include } : {}),
                    ...(args.search_term ? { search_term: args.search_term } : {}),
                },
            );
            return jsonResult(assignments);
        },
    },
    {
        name: "canvas_get_assignment",
        description: "Get full details for a single assignment by course and assignment ID.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            assignment_id: z.number().int().positive(),
            include: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            const assignment = await canvas.get(
                `/api/v1/courses/${args.course_id}/assignments/${args.assignment_id}`,
                {
                    ...(args.include ? { include: args.include } : {}),
                },
            );
            return jsonResult(assignment);
        },
    },
    {
        name: "canvas_list_assignment_groups",
        description: "List assignment groups for a course, optionally including assignments and submissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            include: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            const groups = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/assignment_groups`,
                {
                    per_page: 100,
                    ...(args.include ? { include: args.include } : {}),
                },
            );
            return jsonResult(groups);
        },
    },
    {
        name: "canvas_list_missing_assignments",
        description:
            "List missing submissions for the authenticated student, with optional course and filter constraints.",
        inputSchema: z.object({
            course_ids: z.array(z.string()).optional(),
            include: z.array(z.string()).optional(),
            filter: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            const missing = await canvas.get("/api/v1/users/self/missing_submissions", {
                ...(args.course_ids ? { course_ids: args.course_ids } : {}),
                ...(args.include ? { include: args.include } : {}),
                ...(args.filter ? { filter: args.filter } : {}),
            });
            return jsonResult(missing);
        },
    },

    // ============================================================
    // ADMIN / EDUCATOR TOOLS — commented out for student-only build.
    // Uncomment to enable assignment creation, updates, deletion,
    // bulk date changes, and peer review assignment.
    // ============================================================
    {
        name: "canvas_create_assignment",
        description: "Create a new assignment in a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            name: z.string(),
            submission_types: z.array(z.string()).optional(),
            due_at: z.string().optional(),
            points_possible: z.number().optional(),
        }),
        handler: async (args, { canvas }) => {
            const assignment = await canvas.post(
                `/api/v1/courses/${args.course_id}/assignments`,
                {
                    assignment: {
                        name: args.name,
                        ...(args.submission_types ? { submission_types: args.submission_types } : {}),
                        ...(args.due_at ? { due_at: args.due_at } : {}),
                        ...(args.points_possible !== undefined ? { points_possible: args.points_possible } : {}),
                    },
                },
            );
            return jsonResult(assignment);
        },
    },
    {
        name: "canvas_update_assignment",
        description: "Update an existing assignment in a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            assignment_id: z.number().int().positive(),
            name: z.string().optional(),
            due_at: z.string().optional(),
            points_possible: z.number().optional(),
        }),
        handler: async (args, { canvas }) => {
            const assignment = await canvas.put(
                `/api/v1/courses/${args.course_id}/assignments/${args.assignment_id}`,
                {
                    assignment: {
                        ...(args.name ? { name: args.name } : {}),
                        ...(args.due_at ? { due_at: args.due_at } : {}),
                        ...(args.points_possible !== undefined ? { points_possible: args.points_possible } : {}),
                    },
                },
            );
            return jsonResult(assignment);
        },
    },
    {
        name: "canvas_delete_assignment",
        description: "Delete an assignment from a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            assignment_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.delete(
                `/api/v1/courses/${args.course_id}/assignments/${args.assignment_id}`,
            );
            return jsonResult(result);
        },
    },
    {
        name: "canvas_create_assignment_group",
        description: "Create an assignment group in a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            name: z.string(),
            group_weight: z.number().optional(),
        }),
        handler: async (args, { canvas }) => {
            const group = await canvas.post(
                `/api/v1/courses/${args.course_id}/assignment_groups`,
                {
                    name: args.name,
                    ...(args.group_weight !== undefined ? { group_weight: args.group_weight } : {}),
                },
            );
            return jsonResult(group);
        },
    },
    {
        name: "canvas_bulk_update_assignment_dates",
        description: "Bulk update due dates for multiple assignments in a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            assignment_dates: z.array(z.object({
                id: z.number().int().positive(),
                due_at: z.string().optional(),
                lock_at: z.string().optional(),
                unlock_at: z.string().optional(),
            })),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.put(
                `/api/v1/courses/${args.course_id}/assignments/bulk_update`,
                args.assignment_dates,
            );
            return jsonResult(result);
        },
    },
    {
        name: "canvas_assign_peer_review",
        description: "Assign a peer review for an assignment to a specific reviewer. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            assignment_id: z.number().int().positive(),
            reviewer_id: z.number().int().positive(),
            reviewee_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const review = await canvas.post(
                `/api/v1/courses/${args.course_id}/assignments/${args.assignment_id}/peer_reviews`,
                {
                    user_id: args.reviewer_id,
                    reviewee_id: args.reviewee_id,
                },
            );
            return jsonResult(review);
        },
    },
];
