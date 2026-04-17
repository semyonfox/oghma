import { describe, it, expect, vi } from "vitest";
import { gradeTools } from "../../src/tools/grades.js";
import type { CanvasClient } from "../../src/canvas/client.js";

function findTool(name: string) {
    const tool = gradeTools.find((t) => t.name === name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    return tool;
}

function fakeCanvas(overrides: Partial<CanvasClient>): CanvasClient {
    return overrides as unknown as CanvasClient;
}

describe("grade tools", () => {
    it("canvas_get_my_grades calls collectPaginated with optional course_id + state filters", async () => {
        const collect = vi.fn().mockResolvedValue([
            { id: 10, course_id: 42, grades: { current_grade: "A", final_grade: "A" } },
        ]);
        const tool = findTool("canvas_get_my_grades");
        const result = await tool.handler(
            { course_id: 42, state: ["active"] },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/users/self/enrollments",
            expect.objectContaining({ course_id: 42, state: ["active"], per_page: 100 }),
        );
        expect(result.content[0].text).toContain("current_grade");
    });

    it("canvas_get_my_grades applies client-side limit", async () => {
        const collect = vi.fn().mockResolvedValue([
            { id: 1, course_id: 1, grades: { final_score: 1 } },
            { id: 2, course_id: 2, grades: { final_score: 2 } },
            { id: 3, course_id: 3, grades: { final_score: 3 } },
        ]);
        const tool = findTool("canvas_get_my_grades");
        const result = await tool.handler(
            { limit: 2 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        const parsed = JSON.parse(result.content[0].text) as unknown[];
        expect(parsed).toHaveLength(2);
    });

    it("canvas_get_assignment_feedback hits the submission/self endpoint", async () => {
        const get = vi.fn().mockResolvedValue({
            id: 77,
            assignment_id: 5,
            grade: "B+",
            submission_comments: [{ comment: "Good work" }],
        });
        const tool = findTool("canvas_get_assignment_feedback");
        const result = await tool.handler(
            { course_id: 42, assignment_id: 5 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/42/assignments/5/submissions/self",
            expect.any(Object),
        );
        expect(result.content[0].text).toContain("Good work");
    });

    it("canvas_get_grading_standards calls collectPaginated for course grading standards", async () => {
        const collect = vi.fn().mockResolvedValue([
            { id: 3, title: "Letter Grade", grading_scheme: [{ name: "A", value: 0.94 }] },
        ]);
        const tool = findTool("canvas_get_grading_standards");
        const result = await tool.handler(
            { course_id: 42 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/42/grading_standards",
            expect.any(Object),
        );
        expect(result.content[0].text).toContain("Letter Grade");
    });

    it("canvas_submit_grade calls put with grade payload", async () => {
        const put = vi.fn().mockResolvedValue({ id: 99, grade: "A", user_id: 7 });
        const tool = findTool("canvas_submit_grade");
        const result = await tool.handler(
            { course_id: 42, assignment_id: 5, user_id: 7, posted_grade: "A" },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/courses/42/assignments/5/submissions/7",
            { submission: { posted_grade: "A" } },
        );
        expect(result.content[0].text).toContain("user_id");
    });

    it("canvas_submit_grade omits optional fields when not provided", async () => {
        const put = vi.fn().mockResolvedValue({ id: 100, excused: true });
        const tool = findTool("canvas_submit_grade");
        await tool.handler(
            { course_id: 42, assignment_id: 5, user_id: 8, excuse: true },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/courses/42/assignments/5/submissions/8",
            { submission: { excuse: true } },
        );
    });

    it("canvas_get_all_students_status passes workflow_state and include filters", async () => {
        const collect = vi.fn().mockResolvedValue([
            { id: 1, user_id: 10, workflow_state: "graded", assignment_id: 5 },
        ]);
        const tool = findTool("canvas_get_all_students_status");
        const result = await tool.handler(
            { course_id: 42, workflow_state: "graded", include: ["submission_comments"] },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/42/students/submissions",
            expect.objectContaining({
                per_page: 100,
                student_ids: ["all"],
                workflow_state: "graded",
                include: ["submission_comments"],
            }),
        );
        expect(result.content[0].text).toContain("workflow_state");
    });

    it("canvas_get_all_students_status works without optional filters", async () => {
        const collect = vi.fn().mockResolvedValue([]);
        const tool = findTool("canvas_get_all_students_status");
        await tool.handler(
            { course_id: 42 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/42/students/submissions",
            expect.objectContaining({ per_page: 100, student_ids: ["all"] }),
        );
    });

    it("canvas_get_comprehensive_status fetches enrollments and submissions in parallel", async () => {
        const enrollments = [{ id: 1, user_id: 10, grades: { current_score: 88 } }];
        const submissions = [{ id: 2, assignment_id: 5, user_id: 10, workflow_state: "graded" }];
        const collect = vi
            .fn()
            .mockResolvedValueOnce(enrollments)
            .mockResolvedValueOnce(submissions);
        const tool = findTool("canvas_get_comprehensive_status");
        const result = await tool.handler(
            { course_id: 42 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledTimes(2);
        const parsed = JSON.parse(result.content[0].text) as { enrollments: unknown[]; submissions: unknown[] };
        expect(parsed.enrollments).toHaveLength(1);
        expect(parsed.submissions).toHaveLength(1);
    });
});
