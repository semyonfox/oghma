import { describe, it, expect, vi } from "vitest";
import { rubricTools } from "../../src/tools/rubrics.js";
import type { CanvasClient } from "../../src/canvas/client.js";

function findTool(name: string) {
    const tool = rubricTools.find((t) => t.name === name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    return tool;
}

function fakeCanvas(overrides: Partial<CanvasClient>): CanvasClient {
    return overrides as unknown as CanvasClient;
}

describe("rubric tools", () => {
    it("canvas_list_rubrics calls collectPaginated for a course", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 1, title: "Essay Rubric" }]);
        const tool = findTool("canvas_list_rubrics");
        const result = await tool.handler(
            { course_id: 10 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/10/rubrics",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("Essay Rubric");
    });

    it("canvas_list_rubrics passes include when provided", async () => {
        const collect = vi.fn().mockResolvedValue([]);
        const tool = findTool("canvas_list_rubrics");
        await tool.handler(
            { course_id: 10, include: ["associations"] },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/10/rubrics",
            expect.objectContaining({ include: ["associations"] }),
        );
    });

    it("canvas_get_rubric fetches a single rubric", async () => {
        const get = vi.fn().mockResolvedValue({ id: 3, title: "Presentation Rubric" });
        const tool = findTool("canvas_get_rubric");
        const result = await tool.handler(
            { course_id: 10, rubric_id: 3 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/10/rubrics/3",
            expect.any(Object),
        );
        expect(result.content[0].text).toContain("Presentation Rubric");
    });

    it("canvas_get_rubric passes include and style when provided", async () => {
        const get = vi.fn().mockResolvedValue({ id: 3, title: "Rubric" });
        const tool = findTool("canvas_get_rubric");
        await tool.handler(
            { course_id: 10, rubric_id: 3, include: ["assessments"], style: "full" },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/10/rubrics/3",
            expect.objectContaining({ include: ["assessments"], style: "full" }),
        );
    });

    it("canvas_get_rubric_statistics fetches assessments and returns stats", async () => {
        const get = vi.fn().mockResolvedValue({
            id: 3,
            title: "Stats Rubric",
            assessments: [
                { data: [{ points: 4 }, { points: 8 }] },
                { data: [{ points: 3 }, { points: 7 }] },
            ],
        });
        const tool = findTool("canvas_get_rubric_statistics");
        const result = await tool.handler(
            { course_id: 10, rubric_id: 3 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/10/rubrics/3",
            expect.objectContaining({ include: ["assessments"] }),
        );
        expect(result.content[0].text).toContain("Stats Rubric");
    });

    it("canvas_get_my_rubric_assessment fetches submission with rubric_assessment", async () => {
        const get = vi.fn().mockResolvedValue({
            id: 99,
            rubric_assessment: { criterion_1: { points: 10 } },
        });
        const tool = findTool("canvas_get_my_rubric_assessment");
        const result = await tool.handler(
            { course_id: 10, assignment_id: 7 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/10/assignments/7/submissions/self",
            expect.objectContaining({ include: ["rubric_assessment"] }),
        );
        expect(result.content[0].text).toContain("rubric_assessment");
    });

    it("canvas_create_rubric posts rubric fields to the course endpoint", async () => {
        const post = vi.fn().mockResolvedValue({ id: 5, title: "New Rubric" });
        const tool = findTool("canvas_create_rubric");
        const result = await tool.handler(
            {
                course_id: 10,
                title: "New Rubric",
                criteria: [{ description: "Grammar", points: 10 }],
            },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/10/rubrics",
            expect.objectContaining({ rubric: expect.objectContaining({ title: "New Rubric" }) }),
        );
        expect(result.content[0].text).toContain("New Rubric");
    });

    it("canvas_update_rubric puts updated fields to the rubric endpoint", async () => {
        const put = vi.fn().mockResolvedValue({ id: 5, title: "Renamed Rubric" });
        const tool = findTool("canvas_update_rubric");
        const result = await tool.handler(
            { course_id: 10, rubric_id: 5, title: "Renamed Rubric" },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/courses/10/rubrics/5",
            expect.objectContaining({ rubric: expect.objectContaining({ title: "Renamed Rubric" }) }),
        );
        expect(result.content[0].text).toContain("Renamed Rubric");
    });

    it("canvas_delete_rubric calls delete on the rubric endpoint", async () => {
        const del = vi.fn().mockResolvedValue({ id: 5 });
        const tool = findTool("canvas_delete_rubric");
        const result = await tool.handler(
            { course_id: 10, rubric_id: 5 },
            { canvas: fakeCanvas({ delete: del }) },
        );
        expect(del).toHaveBeenCalledWith("/api/v1/courses/10/rubrics/5");
        expect(result.content[0].text).toContain("5");
    });

    it("canvas_associate_rubric posts association fields to rubric_associations", async () => {
        const post = vi.fn().mockResolvedValue({ id: 20, rubric_id: 5, association_type: "Assignment" });
        const tool = findTool("canvas_associate_rubric");
        const result = await tool.handler(
            {
                course_id: 10,
                rubric_id: 5,
                association_id: 7,
                association_type: "Assignment",
                purpose: "grading",
            },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/10/rubric_associations",
            expect.objectContaining({
                rubric_association: expect.objectContaining({
                    rubric_id: 5,
                    association_id: 7,
                    association_type: "Assignment",
                }),
            }),
        );
        expect(result.content[0].text).toContain("Assignment");
    });

    it("canvas_grade_with_rubric puts rubric_assessment to the submission endpoint", async () => {
        const put = vi.fn().mockResolvedValue({ id: 99, score: 18 });
        const tool = findTool("canvas_grade_with_rubric");
        const rubric_assessment = {
            criterion_1: { points: 10, comments: "Good" },
            criterion_2: { points: 8 },
        };
        const result = await tool.handler(
            { course_id: 10, assignment_id: 7, user_id: 42, rubric_assessment },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/courses/10/assignments/7/submissions/42",
            expect.objectContaining({ rubric_assessment }),
        );
        expect(result.content[0].text).toContain("score");
    });
});
