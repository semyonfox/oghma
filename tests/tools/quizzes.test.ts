import { describe, it, expect, vi } from "vitest";
import { quizTools } from "../../src/tools/quizzes.js";
import type { CanvasClient } from "../../src/canvas/client.js";

function findTool(name: string) {
    const tool = quizTools.find((t) => t.name === name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    return tool;
}

function fakeCanvas(overrides: Partial<CanvasClient>): CanvasClient {
    return overrides as unknown as CanvasClient;
}

describe("quiz tools", () => {
    it("canvas_list_quizzes calls collectPaginated for a course", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 1, title: "Midterm Quiz" }]);
        const tool = findTool("canvas_list_quizzes");
        const result = await tool.handler(
            { course_id: 10 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/10/quizzes",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("Midterm Quiz");
    });

    it("canvas_list_quizzes passes search_term when provided", async () => {
        const collect = vi.fn().mockResolvedValue([]);
        const tool = findTool("canvas_list_quizzes");
        await tool.handler(
            { course_id: 10, search_term: "final" },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/10/quizzes",
            expect.objectContaining({ search_term: "final" }),
        );
    });

    it("canvas_get_quiz fetches a single quiz", async () => {
        const get = vi.fn().mockResolvedValue({ id: 5, title: "Final Exam" });
        const tool = findTool("canvas_get_quiz");
        const result = await tool.handler(
            { course_id: 10, quiz_id: 5 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/10/quizzes/5",
            expect.any(Object),
        );
        expect(result.content[0].text).toContain("Final Exam");
    });

    it("canvas_list_my_quiz_submissions calls collectPaginated", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 1, score: 95 }]);
        const tool = findTool("canvas_list_my_quiz_submissions");
        const result = await tool.handler(
            { course_id: 10, quiz_id: 5 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/10/quizzes/5/submissions",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("95");
    });

    it("canvas_get_my_quiz_submission fetches the self submission", async () => {
        const get = vi.fn().mockResolvedValue({ id: 1, score: 88, attempts_allowed: 3 });
        const tool = findTool("canvas_get_my_quiz_submission");
        const result = await tool.handler(
            { course_id: 10, quiz_id: 5 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/10/quizzes/5/submissions/self",
            expect.any(Object),
        );
        expect(result.content[0].text).toContain("88");
    });

    // admin/educator tools

    it("canvas_create_quiz posts to the quizzes endpoint", async () => {
        const post = vi.fn().mockResolvedValue({ id: 20, title: "New Quiz" });
        const tool = findTool("canvas_create_quiz");
        const result = await tool.handler(
            { course_id: 10, title: "New Quiz", quiz_type: "assignment", published: false },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/10/quizzes",
            expect.objectContaining({ quiz: expect.objectContaining({ title: "New Quiz", quiz_type: "assignment" }) }),
        );
        expect(result.content[0].text).toContain("New Quiz");
    });

    it("canvas_create_quiz omits optional fields when not provided", async () => {
        const post = vi.fn().mockResolvedValue({ id: 21, title: "Minimal Quiz" });
        const tool = findTool("canvas_create_quiz");
        await tool.handler(
            { course_id: 10, title: "Minimal Quiz" },
            { canvas: fakeCanvas({ post }) },
        );
        const body = post.mock.calls[0][1] as { quiz: Record<string, unknown> };
        expect(body.quiz).not.toHaveProperty("quiz_type");
        expect(body.quiz).not.toHaveProperty("published");
    });

    it("canvas_update_quiz puts to the quiz endpoint", async () => {
        const put = vi.fn().mockResolvedValue({ id: 5, title: "Updated Quiz" });
        const tool = findTool("canvas_update_quiz");
        const result = await tool.handler(
            { course_id: 10, quiz_id: 5, title: "Updated Quiz", allowed_attempts: 3 },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/courses/10/quizzes/5",
            expect.objectContaining({ quiz: expect.objectContaining({ title: "Updated Quiz", allowed_attempts: 3 }) }),
        );
        expect(result.content[0].text).toContain("Updated Quiz");
    });

    it("canvas_update_quiz omits optional fields when not provided", async () => {
        const put = vi.fn().mockResolvedValue({ id: 5 });
        const tool = findTool("canvas_update_quiz");
        await tool.handler(
            { course_id: 10, quiz_id: 5 },
            { canvas: fakeCanvas({ put }) },
        );
        const body = put.mock.calls[0][1] as { quiz: Record<string, unknown> };
        expect(body.quiz).not.toHaveProperty("title");
        expect(body.quiz).not.toHaveProperty("published");
    });

    it("canvas_delete_quiz calls delete on the quiz endpoint", async () => {
        const del = vi.fn().mockResolvedValue({ deleted: true });
        const tool = findTool("canvas_delete_quiz");
        const result = await tool.handler(
            { course_id: 10, quiz_id: 5 },
            { canvas: fakeCanvas({ delete: del }) },
        );
        expect(del).toHaveBeenCalledWith("/api/v1/courses/10/quizzes/5");
        expect(result.content[0].text).toContain("true");
    });

    it("canvas_list_quiz_questions calls collectPaginated for questions", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 1, question_text: "What is 2+2?" }]);
        const tool = findTool("canvas_list_quiz_questions");
        const result = await tool.handler(
            { course_id: 10, quiz_id: 5 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/10/quizzes/5/questions",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("2+2");
    });

    it("canvas_create_quiz_question posts a new question", async () => {
        const post = vi.fn().mockResolvedValue({ id: 30, question_text: "What is 2+2?" });
        const tool = findTool("canvas_create_quiz_question");
        const result = await tool.handler(
            { course_id: 10, quiz_id: 5, question_text: "What is 2+2?", question_type: "multiple_choice_question" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/10/quizzes/5/questions",
            expect.objectContaining({ question: expect.objectContaining({ question_text: "What is 2+2?" }) }),
        );
        expect(result.content[0].text).toContain("2+2");
    });

    it("canvas_create_quiz_question omits optional fields when not provided", async () => {
        const post = vi.fn().mockResolvedValue({ id: 31 });
        const tool = findTool("canvas_create_quiz_question");
        await tool.handler(
            { course_id: 10, quiz_id: 5, question_text: "Q?", question_type: "true_false_question" },
            { canvas: fakeCanvas({ post }) },
        );
        const body = post.mock.calls[0][1] as { question: Record<string, unknown> };
        expect(body.question).not.toHaveProperty("question_name");
        expect(body.question).not.toHaveProperty("points_possible");
    });

    it("canvas_update_quiz_question puts to the question endpoint", async () => {
        const put = vi.fn().mockResolvedValue({ id: 30, question_text: "Updated?" });
        const tool = findTool("canvas_update_quiz_question");
        const result = await tool.handler(
            { course_id: 10, quiz_id: 5, question_id: 30, question_text: "Updated?", points_possible: 5 },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/courses/10/quizzes/5/questions/30",
            expect.objectContaining({ question: expect.objectContaining({ question_text: "Updated?", points_possible: 5 }) }),
        );
        expect(result.content[0].text).toContain("Updated?");
    });

    it("canvas_update_quiz_question omits optional fields when not provided", async () => {
        const put = vi.fn().mockResolvedValue({ id: 30 });
        const tool = findTool("canvas_update_quiz_question");
        await tool.handler(
            { course_id: 10, quiz_id: 5, question_id: 30 },
            { canvas: fakeCanvas({ put }) },
        );
        const body = put.mock.calls[0][1] as { question: Record<string, unknown> };
        expect(body.question).not.toHaveProperty("question_name");
        expect(body.question).not.toHaveProperty("question_text");
        expect(body.question).not.toHaveProperty("points_possible");
    });

    it("canvas_delete_quiz_question calls delete on the question endpoint", async () => {
        const del = vi.fn().mockResolvedValue({ deleted: true });
        const tool = findTool("canvas_delete_quiz_question");
        const result = await tool.handler(
            { course_id: 10, quiz_id: 5, question_id: 30 },
            { canvas: fakeCanvas({ delete: del }) },
        );
        expect(del).toHaveBeenCalledWith("/api/v1/courses/10/quizzes/5/questions/30");
        expect(result.content[0].text).toContain("true");
    });

    it("canvas_list_quiz_question_groups calls collectPaginated for groups", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 1, name: "Group A" }]);
        const tool = findTool("canvas_list_quiz_question_groups");
        const result = await tool.handler(
            { course_id: 10, quiz_id: 5 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/10/quizzes/5/groups",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("Group A");
    });

    it("canvas_start_quiz_attempt posts to the submissions endpoint", async () => {
        const post = vi.fn().mockResolvedValue({ id: 99, attempt: 1 });
        const tool = findTool("canvas_start_quiz_attempt");
        const result = await tool.handler(
            { course_id: 10, quiz_id: 5 },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/10/quizzes/5/submissions",
        );
        expect(result.content[0].text).toContain("99");
    });
});
