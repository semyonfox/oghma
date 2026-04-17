import { z } from "zod";
import type { ToolDef } from "./types";
import { jsonResult } from "./types";

export const rubricTools: ToolDef[] = [
    {
        name: "canvas_list_rubrics",
        description: "List rubrics for a course. Optionally include associations or assessments.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            include: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            const rubrics = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/rubrics`,
                {
                    per_page: 100,
                    ...(args.include ? { include: args.include } : {}),
                },
            );
            return jsonResult(rubrics);
        },
    },
    {
        name: "canvas_get_rubric",
        description:
            "Get details for a single rubric by course and rubric ID. " +
            "include[] supports `assessments`, `graded_assessments`, `peer_assessments`. " +
            "style can be `full` or `comments_only`.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            rubric_id: z.number().int().positive(),
            include: z.array(z.string()).optional(),
            style: z.enum(["full", "comments_only"]).optional(),
        }),
        handler: async (args, { canvas }) => {
            const rubric = await canvas.get(
                `/api/v1/courses/${args.course_id}/rubrics/${args.rubric_id}`,
                {
                    ...(args.include ? { include: args.include } : {}),
                    ...(args.style ? { style: args.style } : {}),
                },
            );
            return jsonResult(rubric);
        },
    },
    {
        name: "canvas_get_rubric_statistics",
        description:
            "Fetch a rubric with all assessments included and return the raw data for " +
            "client-side statistics (point distributions per criterion).",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            rubric_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const rubric = await canvas.get(
                `/api/v1/courses/${args.course_id}/rubrics/${args.rubric_id}`,
                { include: ["assessments"] },
            );
            return jsonResult(rubric);
        },
    },
    {
        name: "canvas_get_my_rubric_assessment",
        description:
            "Get the authenticated student's rubric assessment for an assignment submission.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            assignment_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const submission = await canvas.get(
                `/api/v1/courses/${args.course_id}/assignments/${args.assignment_id}/submissions/self`,
                { include: ["rubric_assessment"] },
            );
            return jsonResult(submission);
        },
    },

    // ============================================================
    // ADMIN / EDUCATOR TOOLS — commented out for student-only build.
    // Uncomment to enable rubric creation, updates, deletion,
    // association management, and rubric-based grading.
    // ============================================================
    {
        name: "canvas_create_rubric",
        description: "Create a rubric in a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            title: z.string(),
            free_form_criterion_comments: z.boolean().optional(),
            criteria: z.array(z.object({
                description: z.string(),
                points: z.number(),
                criterion_use_range: z.boolean().optional(),
            })).optional(),
        }),
        handler: async (args, { canvas }) => {
            const { course_id, ...fields } = args;
            const rubric = await canvas.post(`/api/v1/courses/${course_id}/rubrics`, {
                rubric: fields,
            });
            return jsonResult(rubric);
        },
    },
    {
        name: "canvas_update_rubric",
        description: "Update a rubric in a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            rubric_id: z.number().int().positive(),
            title: z.string().optional(),
            free_form_criterion_comments: z.boolean().optional(),
        }),
        handler: async (args, { canvas }) => {
            const { course_id, rubric_id, ...fields } = args;
            const rubric = await canvas.put(
                `/api/v1/courses/${course_id}/rubrics/${rubric_id}`,
                { rubric: fields },
            );
            return jsonResult(rubric);
        },
    },
    {
        name: "canvas_delete_rubric",
        description: "Delete a rubric from a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            rubric_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.delete(
                `/api/v1/courses/${args.course_id}/rubrics/${args.rubric_id}`,
            );
            return jsonResult(result);
        },
    },
    {
        name: "canvas_associate_rubric",
        description: "Associate a rubric with an assignment in a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            rubric_id: z.number().int().positive(),
            association_id: z.number().int().positive(),
            association_type: z.enum(["Assignment", "Course", "Account"]),
            purpose: z.enum(["grading", "bookmark"]).optional(),
        }),
        handler: async (args, { canvas }) => {
            const { course_id, ...fields } = args;
            const association = await canvas.post(
                `/api/v1/courses/${course_id}/rubric_associations`,
                { rubric_association: fields },
            );
            return jsonResult(association);
        },
    },
    {
        name: "canvas_grade_with_rubric",
        description: "Grade a student submission using a rubric. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            assignment_id: z.number().int().positive(),
            user_id: z.number().int().positive(),
            rubric_assessment: z.record(z.object({
                points: z.number().optional(),
                comments: z.string().optional(),
            })),
        }),
        handler: async (args, { canvas }) => {
            const { course_id, assignment_id, user_id, rubric_assessment } = args;
            const result = await canvas.put(
                `/api/v1/courses/${course_id}/assignments/${assignment_id}/submissions/${user_id}`,
                { rubric_assessment },
            );
            return jsonResult(result);
        },
    },
];
