import { z } from "zod";
import { canvasIdSchema, canvasUserIdSchema } from "./canvas-id.ts";
import type { ToolDef } from "./types.ts";
import { defineTool, jsonResult } from "./types.ts";

export const submissionTools: ToolDef[] = [
    defineTool({
        name: "canvas_get_my_submission",
        description:
            "Get the authenticated student's own submission for a specific assignment. Supports include[] for submission_comments, rubric_assessment, and submission_history.",
        inputSchema: z.object({
            course_id: canvasIdSchema,
            assignment_id: canvasIdSchema,
            include: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            const submission = await canvas.get(
                `/api/v1/courses/${args.course_id}/assignments/${args.assignment_id}/submissions/self`,
                {
                    ...(args.include ? { include: args.include } : {}),
                },
            );
            return jsonResult(submission);
        },
    }),
    defineTool({
        name: "canvas_list_my_submissions",
        description:
            "List the authenticated student's submissions for a course. Defaults to student_ids=[self]. Optionally filter by workflow_state (submitted, graded, pending_review) or include[] fields.",
        inputSchema: z.object({
            course_id: canvasIdSchema,
            student_ids: z.array(canvasUserIdSchema).optional(),
            workflow_state: z.enum(["submitted", "unsubmitted", "graded", "pending_review"]).optional(),
            include: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            const submissions = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/students/submissions`,
                {
                    per_page: 100,
                    student_ids: args.student_ids ?? ["self"],
                    ...(args.workflow_state ? { workflow_state: args.workflow_state } : {}),
                    ...(args.include ? { include: args.include } : {}),
                },
            );
            return jsonResult(submissions);
        },
    }),
    defineTool({
        name: "canvas_get_submission_comments",
        description:
            "Get submission comments for a specific assignment submission. Defaults to the authenticated student's own submission (user_id=self). Wraps include[]=submission_comments.",
        inputSchema: z.object({
            course_id: canvasIdSchema,
            assignment_id: canvasIdSchema,
            user_id: canvasUserIdSchema.optional(),
        }),
        handler: async (args, { canvas }) => {
            const userId = args.user_id ?? "self";
            const submission = await canvas.get(
                `/api/v1/courses/${args.course_id}/assignments/${args.assignment_id}/submissions/${userId}`,
                {
                    include: ["submission_comments"],
                },
            );
            return jsonResult(submission);
        },
    }),
    defineTool({
        name: "canvas_list_peer_reviews_todo",
        description:
            "List peer review todo items for the authenticated student by querying the user todo list and filtering for type=reviewing.",
        inputSchema: z.object({}),
        handler: async (args, { canvas }) => {
            const todo = await canvas.get("/api/v1/users/self/todo", {});
            // filter to reviewing items only; todo may be an array or non-array
            const items = Array.isArray(todo)
                ? todo.filter((item: Record<string, unknown>) => item.type === "reviewing")
                : todo;
            return jsonResult(items);
        },
    }),
    defineTool({
        name: "canvas_list_peer_reviews_for_assignment",
        description:
            "List peer reviews assigned for a specific assignment. Supports include[] for submission_comments and user details.",
        inputSchema: z.object({
            course_id: canvasIdSchema,
            assignment_id: canvasIdSchema,
            include: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            const reviews = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/assignments/${args.assignment_id}/peer_reviews`,
                {
                    per_page: 100,
                    ...(args.include ? { include: args.include } : {}),
                },
            );
            return jsonResult(reviews);
        },
    }),

    // file and media submissions need a multi-step upload flow, so they are
    // rejected by the schema rather than reported as done without submitting
    defineTool({
        name: "canvas_submit_assignment",
        description:
            "Submit the authenticated student's own work for an assignment as online_text_entry (send body as HTML) " +
            "or online_url (send url). File uploads and media recordings are not supported.",
        inputSchema: z
            .object({
                course_id: canvasIdSchema,
                assignment_id: canvasIdSchema,
                submission_type: z.enum(["online_text_entry", "online_url"]),
                body: z.string().min(1).optional(),
                url: z.url({ protocol: /^https?$/ }).optional(),
            })
            .superRefine((args, ctx) => {
                if (args.submission_type === "online_text_entry" && args.body === undefined) {
                    ctx.addIssue({ code: "custom", path: ["body"], message: "body is required for online_text_entry" });
                }
                if (args.submission_type === "online_url" && args.url === undefined) {
                    ctx.addIssue({ code: "custom", path: ["url"], message: "url is required for online_url" });
                }
            }),
        handler: async (args, { canvas }) => {
            const result = await canvas.post(
                `/api/v1/courses/${args.course_id}/assignments/${args.assignment_id}/submissions`,
                {
                    submission: {
                        submission_type: args.submission_type,
                        ...(args.submission_type === "online_text_entry" ? { body: args.body } : { url: args.url }),
                    },
                },
            );
            return jsonResult(result);
        },
    }),

    // educator tools. the hosted profile disables these in src/lib/canvas/mcp.ts
    defineTool({
        name: "canvas_grade_submission",
        description: "Grade a student's submission for an assignment. Requires educator permissions.",
        inputSchema: z.object({
            course_id: canvasIdSchema,
            assignment_id: canvasIdSchema,
            user_id: canvasIdSchema,
            posted_grade: z.string().optional(),
            excuse: z.boolean().optional(),
        }),
        handler: async (args, { canvas }) => {
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
    }),
    defineTool({
        name: "canvas_bulk_grade_submissions",
        description: "Bulk update grades for multiple submissions on an assignment. Requires educator permissions.",
        inputSchema: z.object({
            course_id: canvasIdSchema,
            assignment_id: canvasIdSchema,
            grade_data: z.record(z.string(), z.object({ posted_grade: z.string() })),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.post(
                `/api/v1/courses/${args.course_id}/assignments/${args.assignment_id}/submissions/update_grades`,
                { grade_data: args.grade_data },
            );
            return jsonResult(result);
        },
    }),
    defineTool({
        name: "canvas_post_submission_comment",
        description: "Post a comment on a student's submission for an assignment. Requires educator permissions.",
        inputSchema: z.object({
            course_id: canvasIdSchema,
            assignment_id: canvasIdSchema,
            user_id: canvasIdSchema,
            comment: z.string(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.put(
                `/api/v1/courses/${args.course_id}/assignments/${args.assignment_id}/submissions/${args.user_id}`,
                {
                    comment: { text_comment: args.comment },
                },
            );
            return jsonResult(result);
        },
    }),
    defineTool({
        name: "canvas_list_section_submissions",
        description: "List all submissions for a section across assignments. Requires educator permissions.",
        inputSchema: z.object({
            section_id: canvasIdSchema,
            assignment_ids: z.array(canvasIdSchema).optional(),
            workflow_state: z.enum(["submitted", "unsubmitted", "graded", "pending_review"]).optional(),
            include: z.array(z.string()).optional(),
        }),
        handler: async (args, { canvas }) => {
            const submissions = await canvas.collectPaginated(
                `/api/v1/sections/${args.section_id}/students/submissions`,
                {
                    per_page: 100,
                    ...(args.assignment_ids ? { assignment_ids: args.assignment_ids } : {}),
                    ...(args.workflow_state ? { workflow_state: args.workflow_state } : {}),
                    ...(args.include ? { include: args.include } : {}),
                },
            );
            return jsonResult(submissions);
        },
    }),
];
