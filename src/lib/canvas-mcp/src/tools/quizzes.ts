import { z } from "zod";
import type { ToolDef } from "./types.js";
import { jsonResult } from "./types.js";

export const quizTools: ToolDef[] = [
    {
        name: "canvas_list_quizzes",
        description: "List quizzes for a course. Optionally filter by search_term.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            search_term: z.string().optional(),
        }),
        handler: async (args, { canvas }) => {
            const quizzes = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/quizzes`,
                {
                    per_page: 100,
                    ...(args.search_term ? { search_term: args.search_term } : {}),
                },
            );
            return jsonResult(quizzes);
        },
    },
    {
        name: "canvas_get_quiz",
        description: "Get details for a single quiz by course and quiz ID.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            quiz_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const quiz = await canvas.get(
                `/api/v1/courses/${args.course_id}/quizzes/${args.quiz_id}`,
                {},
            );
            return jsonResult(quiz);
        },
    },
    {
        name: "canvas_list_my_quiz_submissions",
        description:
            "List submissions for a quiz. Filtered to the authenticated student. Includes score and attempt data.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            quiz_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const submissions = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/quizzes/${args.quiz_id}/submissions`,
                { per_page: 100 },
            );
            return jsonResult(submissions);
        },
    },
    {
        name: "canvas_get_my_quiz_submission",
        description:
            "Get the authenticated student's latest submission for a quiz, including score and attempts.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            quiz_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const submission = await canvas.get(
                `/api/v1/courses/${args.course_id}/quizzes/${args.quiz_id}/submissions/self`,
                {},
            );
            return jsonResult(submission);
        },
    },

    // ============================================================
    // ADMIN / EDUCATOR TOOLS — commented out for student-only build.
    // Uncomment to enable quiz authoring, question management,
    // question groups, and starting quiz attempts.
    // ============================================================
    {
        name: "canvas_create_quiz",
        description: "Create a quiz in a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            title: z.string(),
            quiz_type: z.enum(["practice_quiz", "assignment", "graded_survey", "survey"]).optional(),
            time_limit: z.number().int().positive().optional(),
            allowed_attempts: z.number().int().optional(),
            published: z.boolean().optional(),
        }),
        handler: async (args, { canvas }) => {
            const { course_id, ...fields } = args;
            const quiz = await canvas.post(`/api/v1/courses/${course_id}/quizzes`, {
                quiz: {
                    title: fields.title,
                    ...(fields.quiz_type !== undefined ? { quiz_type: fields.quiz_type } : {}),
                    ...(fields.time_limit !== undefined ? { time_limit: fields.time_limit } : {}),
                    ...(fields.allowed_attempts !== undefined ? { allowed_attempts: fields.allowed_attempts } : {}),
                    ...(fields.published !== undefined ? { published: fields.published } : {}),
                },
            });
            return jsonResult(quiz);
        },
    },
    {
        name: "canvas_update_quiz",
        description: "Update a quiz in a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            quiz_id: z.number().int().positive(),
            title: z.string().optional(),
            quiz_type: z.enum(["practice_quiz", "assignment", "graded_survey", "survey"]).optional(),
            time_limit: z.number().int().positive().optional(),
            allowed_attempts: z.number().int().optional(),
            published: z.boolean().optional(),
        }),
        handler: async (args, { canvas }) => {
            const { course_id, quiz_id, ...fields } = args;
            const quiz = await canvas.put(
                `/api/v1/courses/${course_id}/quizzes/${quiz_id}`,
                {
                    quiz: {
                        ...(fields.title !== undefined ? { title: fields.title } : {}),
                        ...(fields.quiz_type !== undefined ? { quiz_type: fields.quiz_type } : {}),
                        ...(fields.time_limit !== undefined ? { time_limit: fields.time_limit } : {}),
                        ...(fields.allowed_attempts !== undefined ? { allowed_attempts: fields.allowed_attempts } : {}),
                        ...(fields.published !== undefined ? { published: fields.published } : {}),
                    },
                },
            );
            return jsonResult(quiz);
        },
    },
    {
        name: "canvas_delete_quiz",
        description: "Delete a quiz from a course. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            quiz_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.delete(
                `/api/v1/courses/${args.course_id}/quizzes/${args.quiz_id}`,
            );
            return jsonResult(result);
        },
    },
    {
        name: "canvas_list_quiz_questions",
        description: "List questions for a quiz. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            quiz_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const questions = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/quizzes/${args.quiz_id}/questions`,
                { per_page: 100 },
            );
            return jsonResult(questions);
        },
    },
    {
        name: "canvas_create_quiz_question",
        description: "Create a question in a quiz. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            quiz_id: z.number().int().positive(),
            question_name: z.string().optional(),
            question_text: z.string(),
            question_type: z.string(),
            points_possible: z.number().optional(),
        }),
        handler: async (args, { canvas }) => {
            const { course_id, quiz_id, question_name, question_text, question_type, points_possible } = args;
            const question = await canvas.post(
                `/api/v1/courses/${course_id}/quizzes/${quiz_id}/questions`,
                {
                    question: {
                        question_text,
                        question_type,
                        ...(question_name !== undefined ? { question_name } : {}),
                        ...(points_possible !== undefined ? { points_possible } : {}),
                    },
                },
            );
            return jsonResult(question);
        },
    },
    {
        name: "canvas_update_quiz_question",
        description: "Update a question in a quiz. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            quiz_id: z.number().int().positive(),
            question_id: z.number().int().positive(),
            question_name: z.string().optional(),
            question_text: z.string().optional(),
            points_possible: z.number().optional(),
        }),
        handler: async (args, { canvas }) => {
            const { course_id, quiz_id, question_id, question_name, question_text, points_possible } = args;
            const question = await canvas.put(
                `/api/v1/courses/${course_id}/quizzes/${quiz_id}/questions/${question_id}`,
                {
                    question: {
                        ...(question_name !== undefined ? { question_name } : {}),
                        ...(question_text !== undefined ? { question_text } : {}),
                        ...(points_possible !== undefined ? { points_possible } : {}),
                    },
                },
            );
            return jsonResult(question);
        },
    },
    {
        name: "canvas_delete_quiz_question",
        description: "Delete a question from a quiz. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            quiz_id: z.number().int().positive(),
            question_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const result = await canvas.delete(
                `/api/v1/courses/${args.course_id}/quizzes/${args.quiz_id}/questions/${args.question_id}`,
            );
            return jsonResult(result);
        },
    },
    {
        name: "canvas_list_quiz_question_groups",
        description: "List question groups for a quiz. Requires educator permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            quiz_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const groups = await canvas.collectPaginated(
                `/api/v1/courses/${args.course_id}/quizzes/${args.quiz_id}/groups`,
                { per_page: 100 },
            );
            return jsonResult(groups);
        },
    },
    {
        name: "canvas_start_quiz_attempt",
        description: "Start a new submission attempt for a quiz. Requires admin permissions.",
        inputSchema: z.object({
            course_id: z.number().int().positive(),
            quiz_id: z.number().int().positive(),
        }),
        handler: async (args, { canvas }) => {
            const submission = await canvas.post(
                `/api/v1/courses/${args.course_id}/quizzes/${args.quiz_id}/submissions`,
            );
            return jsonResult(submission);
        },
    },
];
