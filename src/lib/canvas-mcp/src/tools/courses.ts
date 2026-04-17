import { z } from "zod";
import type { ToolDef } from "./types";
import { jsonResult } from "./types";

export const courseTools: ToolDef[] = [
    {
        name: "canvas_list_courses",
        description:
            "List the authenticated user's courses. Canonical endpoint for 'my courses' / 'my classes'. Filter by enrollment_state (active|invited_or_pending|completed). Use include to pull extras like term, teachers, total_students, or current_grading_period_scores.",
        inputSchema: z.object({
            enrollment_state: z.enum(["active", "invited_or_pending", "completed"]).optional(),
            include: z.array(z.string()).optional(),
        }),
        handler: async (args: any, { canvas }) => {
            const courses = await canvas.collectPaginated("/api/v1/courses", {
                per_page: 100,
                ...(args.enrollment_state ? { enrollment_state: args.enrollment_state } : {}),
                ...(args.include ? { include: args.include } : {}),
            });
            return jsonResult(courses);
        },
    },
    {
        name: "canvas_get_course",
        description: "Get full details for a single course by ID.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            include: z.array(z.string()).optional(),
        }),
        handler: async (args: any, { canvas }) => {
            const course = await canvas.get(`/api/v1/courses/${args.course_id}`, {
                ...(args.include ? { include: args.include } : {}),
            });
            return jsonResult(course);
        },
    },
    {
        name: "canvas_list_sections",
        description: "List sections for a course.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
        }),
        handler: async (args: any, { canvas }) => {
            const sections = await canvas.collectPaginated(`/api/v1/courses/${args.course_id}/sections`, {
                per_page: 100,
            });
            return jsonResult(sections);
        },
    },

    // ============================================================
    // ADMIN / EDUCATOR TOOLS — commented out for student-only build.
    // Uncomment to enable course creation, updates, and deletion.
    // ============================================================
    {
        name: "canvas_create_course",
        description: "Create a new course in an account. Requires admin permissions.",
        inputSchema: z.object({
            account_id: z.number().int().positive(),
            name: z.string(),
            course_code: z.string().optional(),
        }),
        handler: async (args: any, { canvas }) => {
            const course = await canvas.post(`/api/v1/accounts/${args.account_id}/courses`, {
                course: {
                    name: args.name,
                    ...(args.course_code !== undefined ? { course_code: args.course_code } : {}),
                },
            });
            return jsonResult(course);
        },
    },
];
