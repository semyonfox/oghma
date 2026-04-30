import { describe, it, expect, vi } from "vitest";
import { submissionTools } from "../../src/tools/submissions.js";
import type { CanvasClient } from "../../src/canvas/client.js";

function findTool(name: string) {
    const tool = submissionTools.find((t) => t.name === name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    return tool;
}

function fakeCanvas(overrides: Partial<CanvasClient>): CanvasClient {
    return overrides as unknown as CanvasClient;
}

describe("submission tools", () => {
    it("canvas_get_my_submission hits the self submission endpoint", async () => {
        const get = vi.fn().mockResolvedValue({ id: 101, score: 88, workflow_state: "graded" });
        const tool = findTool("canvas_get_my_submission");
        const result = await tool.handler(
            { course_id: 5, assignment_id: 10 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignments/10/submissions/self",
            expect.any(Object),
        );
        expect(result.content[0].text).toContain("graded");
    });

    it("canvas_list_my_submissions calls collectPaginated with student_ids=self", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 202, assignment_id: 10, workflow_state: "submitted" }]);
        const tool = findTool("canvas_list_my_submissions");
        const result = await tool.handler(
            { course_id: 5 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/5/students/submissions",
            expect.objectContaining({ per_page: 100, student_ids: ["self"] }),
        );
        expect(result.content[0].text).toContain("submitted");
    });

    it("canvas_get_submission_comments wraps include submission_comments", async () => {
        const get = vi.fn().mockResolvedValue({ id: 303, submission_comments: [{ comment: "Nice work" }] });
        const tool = findTool("canvas_get_submission_comments");
        const result = await tool.handler(
            { course_id: 5, assignment_id: 10 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignments/10/submissions/self",
            expect.objectContaining({ include: ["submission_comments"] }),
        );
        expect(result.content[0].text).toContain("Nice work");
    });

    it("canvas_list_peer_reviews_todo calls get on todo and returns items", async () => {
        const get = vi.fn().mockResolvedValue([
            { type: "reviewing", assignment: { id: 7, name: "Lab Report" } },
            { type: "submitting", assignment: { id: 8, name: "Essay" } },
        ]);
        const tool = findTool("canvas_list_peer_reviews_todo");
        const result = await tool.handler(
            {},
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith("/api/v1/users/self/todo", {});
        expect(result.content[0].text).toContain("reviewing");
    });

    it("canvas_list_peer_reviews_for_assignment calls collectPaginated on peer_reviews endpoint", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 404, assessor_id: 11 }]);
        const tool = findTool("canvas_list_peer_reviews_for_assignment");
        const result = await tool.handler(
            { course_id: 5, assignment_id: 10 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignments/10/peer_reviews",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("assessor_id");
    });

    // educator tools

    it("canvas_submit_assignment posts text entry submission", async () => {
        const post = vi.fn().mockResolvedValue({ id: 501, submission_type: "online_text_entry" });
        const tool = findTool("canvas_submit_assignment");
        const result = await tool.handler(
            { course_id: 5, assignment_id: 10, submission_type: "online_text_entry", body: "My answer" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignments/10/submissions",
            expect.objectContaining({
                submission: expect.objectContaining({ submission_type: "online_text_entry", body: "My answer" }),
            }),
        );
        expect(result.content[0].text).toContain("online_text_entry");
    });

    it("canvas_submit_assignment posts url submission", async () => {
        const post = vi.fn().mockResolvedValue({ id: 502, submission_type: "online_url" });
        const tool = findTool("canvas_submit_assignment");
        const result = await tool.handler(
            { course_id: 5, assignment_id: 10, submission_type: "online_url", url: "https://example.com" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignments/10/submissions",
            expect.objectContaining({
                submission: expect.objectContaining({ submission_type: "online_url", url: "https://example.com" }),
            }),
        );
        expect(result.content[0].text).toContain("online_url");
    });

    it("canvas_submit_assignment returns stub for online_upload", async () => {
        const post = vi.fn();
        const tool = findTool("canvas_submit_assignment");
        const result = await tool.handler(
            { course_id: 5, assignment_id: 10, submission_type: "online_upload" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("multi-step flow");
        expect(result.content[0].text).toContain("file_ids");
    });

    it("canvas_submit_assignment returns stub for media_recording", async () => {
        const post = vi.fn();
        const tool = findTool("canvas_submit_assignment");
        const result = await tool.handler(
            { course_id: 5, assignment_id: 10, submission_type: "media_recording" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("multi-step flow");
        expect(result.content[0].text).toContain("Kaltura");
    });

    it("canvas_grade_submission puts grade to submission endpoint", async () => {
        const put = vi.fn().mockResolvedValue({ id: 601, grade: "A", workflow_state: "graded" });
        const tool = findTool("canvas_grade_submission");
        const result = await tool.handler(
            { course_id: 5, assignment_id: 10, user_id: 42, posted_grade: "A" },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignments/10/submissions/42",
            expect.objectContaining({
                submission: expect.objectContaining({ posted_grade: "A" }),
            }),
        );
        expect(result.content[0].text).toContain("graded");
    });

    it("canvas_grade_submission can excuse a student", async () => {
        const put = vi.fn().mockResolvedValue({ id: 602, excused: true });
        const tool = findTool("canvas_grade_submission");
        const result = await tool.handler(
            { course_id: 5, assignment_id: 10, user_id: 42, excuse: true },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignments/10/submissions/42",
            expect.objectContaining({
                submission: expect.objectContaining({ excuse: true }),
            }),
        );
        expect(result.content[0].text).toContain("excused");
    });

    it("canvas_bulk_grade_submissions posts to update_grades endpoint", async () => {
        const post = vi.fn().mockResolvedValue({ progress: { workflow_state: "queued" } });
        const tool = findTool("canvas_bulk_grade_submissions");
        const gradeData = { "42": { posted_grade: "B+" }, "43": { posted_grade: "A-" } };
        const result = await tool.handler(
            { course_id: 5, assignment_id: 10, grade_data: gradeData },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignments/10/submissions/update_grades",
            expect.objectContaining({ grade_data: gradeData }),
        );
        expect(result.content[0].text).toContain("queued");
    });

    it("canvas_post_submission_comment puts comment on submission", async () => {
        const put = vi.fn().mockResolvedValue({ id: 701, submission_comments: [{ comment: "Well done!" }] });
        const tool = findTool("canvas_post_submission_comment");
        const result = await tool.handler(
            { course_id: 5, assignment_id: 10, user_id: 42, comment: "Well done!" },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignments/10/submissions/42",
            expect.objectContaining({
                comment: { text_comment: "Well done!" },
            }),
        );
        expect(result.content[0].text).toContain("Well done!");
    });

    it("canvas_list_section_submissions calls collectPaginated on section submissions endpoint", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 801, user_id: 42, workflow_state: "graded" }]);
        const tool = findTool("canvas_list_section_submissions");
        const result = await tool.handler(
            { section_id: 99 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/sections/99/students/submissions",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("graded");
    });

    it("canvas_list_section_submissions filters by assignment_ids and workflow_state", async () => {
        const collect = vi.fn().mockResolvedValue([]);
        const tool = findTool("canvas_list_section_submissions");
        await tool.handler(
            { section_id: 99, assignment_ids: [10, 11], workflow_state: "submitted" },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/sections/99/students/submissions",
            expect.objectContaining({ assignment_ids: [10, 11], workflow_state: "submitted" }),
        );
    });
});
