import { z } from "zod";
import type { ToolDef } from "./types";
import { jsonResult } from "./types";

export const gradeTools: ToolDef[] = [
    {
        name: "canvas_get_my_grades",
        description:
            "Get the authenticated student's grades across courses. Returns enrollment objects that include current_score, final_score, current_grade, final_grade, and grading-period fields. Optional filters: course_id (single course), state (active|completed|invited — defaults to active+invited), limit (cap result count). Use this for any 'what are my grades' question.",
        inputSchema: z.object({
            course_id: z.number().int().positive().optional(),
            state: z.array(z.enum(["active", "invited", "completed", "inactive"])).optional(),
            limit: z.number().int().positive().optional(),
        }),
        handler: async (args: any, { canvas }) => {
            const enrollments = await canvas.collectPaginated<Record<string, unknown>>(
                "/api/v1/users/self/enrollments",
                {
                    per_page: 100,
                    ...(args.course_id ? { course_id: args.course_id } : {}),
                    ...(args.state ? { state: args.state } : {}),
                },
            );
            const result = args.limit !== undefined ? enrollments.slice(0, args.limit) : enrollments;
            return jsonResult(result);
        },
    },
    {
        name: "canvas_get_assignment_feedback",
        description:
            "Get grading feedback for a specific assignment submission, including submission comments and rubric assessment.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            assignment_id: z.number().int().positive(),
            include: z.array(z.string()).optional(),
        }),
        handler: async (args: any, { canvas }) => {
            const submission = await canvas.get(
                `/api/v1/courses/${args.course_id}/assignments/${args.assignment_id}/submissions/self`,
                {
                    include: args.include ?? ["submission_comments", "rubric_assessment"],
                },
            );
            return jsonResult(submission);
        },
    },
    {
        name: "canvas_get_grading_standards",
        description:
            "Get grading standards (letter-grade thresholds) for a course.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
        }),
        handler: async (args: any, { canvas }) => {
            const standards = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/grading_standards`,
                { per_page: 100 },
            );
            return jsonResult(standards);
        },
    },

    // ============================================================
    // ADMIN / EDUCATOR TOOLS — commented out for student-only build.
    // Uncomment to enable grade submission, bulk status views,
    // and comprehensive grade + submission roll-ups.
    // ============================================================
    {
        name: "canvas_submit_grade",
        description: "Grade a student's submission for an assignment. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            assignment_id: z.number().int().positive(),
            user_id: z.number().int().positive(),
            posted_grade: z.string().optional(),
            excuse: z.boolean().optional(),
        }),
        handler: async (args: any, { canvas }) => {
            const result = await canvas.put(
                `/api/v1/courses/${args.course_id}/assignments/${args.assignment_id}/submissions/${args.user_id}`,
                {
                    submission: {
                        ...(args.posted_grade !== undefined ? { posted_grade: args.posted_grade } : {}),
                        ...(args.excuse !== undefined ? { excuse: args.excuse } : {}),
                    },
                },
            );
            return jsonResult(result);
        },
    },
    {
        name: "canvas_get_all_students_status",
        description: "List all student submissions for a course across assignments. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            workflow_state: z.enum(["submitted", "unsubmitted", "graded", "pending_review"]).optional(),
            include: z.array(z.string()).optional(),
        }),
        handler: async (args: any, { canvas }) => {
            const submissions = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/students/submissions`,
                {
                    per_page: 100,
                    student_ids: ["all"],
                    ...(args.workflow_state ? { workflow_state: args.workflow_state } : {}),
                    ...(args.include ? { include: args.include } : {}),
                },
            );
            return jsonResult(submissions);
        },
    },
    {
        name: "canvas_get_comprehensive_status",
        description: "Composite grade + submission roll-up for all students in a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
        }),
        handler: async (args: any, { canvas }) => {
            const [enrollments, submissions] = await Promise.all([
                canvas.collectPaginated(`/api/v1/courses/${args.course_id}/enrollments`, {
                    per_page: 100,
                    type: ["StudentEnrollment"],
                    include: ["grades"],
                }),
                canvas.collectPaginated(`/api/v1/courses/${args.course_id}/students/submissions`, {
                    per_page: 100,
                    student_ids: ["all"],
                }),
            ]);
            return jsonResult({ enrollments, submissions });
        },
    },
];
