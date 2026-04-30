import { describe, it, expect, vi } from "vitest";
import { assignmentTools } from "../../src/tools/assignments.js";
import type { CanvasClient } from "../../src/canvas/client.js";

function findTool(name: string) {
    const tool = assignmentTools.find((t) => t.name === name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    return tool;
}

function fakeCanvas(overrides: Partial<CanvasClient>): CanvasClient {
    return overrides as unknown as CanvasClient;
}

describe("assignment tools", () => {
    it("canvas_list_assignments calls collectPaginated with course and bucket filter", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 10, name: "Essay 1" }]);
        const tool = findTool("canvas_list_assignments");
        const result = await tool.handler(
            { course_id: 5, bucket: "upcoming" },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignments",
            expect.objectContaining({ per_page: 100, bucket: "upcoming" }),
        );
        expect(result.content[0].text).toContain("Essay 1");
    });

    it("canvas_get_assignment hits the single-assignment endpoint", async () => {
        const get = vi.fn().mockResolvedValue({ id: 20, name: "Midterm" });
        const tool = findTool("canvas_get_assignment");
        const result = await tool.handler(
            { course_id: 5, assignment_id: 20 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignments/20",
            expect.any(Object),
        );
        expect(result.content[0].text).toContain("Midterm");
    });

    it("canvas_list_assignment_groups calls collectPaginated for a course", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 3, name: "Homework" }]);
        const tool = findTool("canvas_list_assignment_groups");
        const result = await tool.handler(
            { course_id: 5 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignment_groups",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("Homework");
    });

    it("canvas_list_missing_assignments calls get on missing_submissions", async () => {
        const get = vi.fn().mockResolvedValue([{ id: 55, name: "Lab Report" }]);
        const tool = findTool("canvas_list_missing_assignments");
        const result = await tool.handler(
            {},
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/users/self/missing_submissions",
            expect.any(Object),
        );
        expect(result.content[0].text).toContain("Lab Report");
    });

    it("canvas_create_assignment posts to assignments endpoint", async () => {
        const post = vi.fn().mockResolvedValue({ id: 99, name: "New Essay" });
        const tool = findTool("canvas_create_assignment");
        const result = await tool.handler(
            { course_id: 5, name: "New Essay", points_possible: 100 },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignments",
            expect.objectContaining({ assignment: expect.objectContaining({ name: "New Essay", points_possible: 100 }) }),
        );
        expect(result.content[0].text).toContain("New Essay");
    });

    it("canvas_update_assignment puts to single assignment endpoint", async () => {
        const put = vi.fn().mockResolvedValue({ id: 20, name: "Updated Midterm" });
        const tool = findTool("canvas_update_assignment");
        const result = await tool.handler(
            { course_id: 5, assignment_id: 20, name: "Updated Midterm" },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignments/20",
            expect.objectContaining({ assignment: expect.objectContaining({ name: "Updated Midterm" }) }),
        );
        expect(result.content[0].text).toContain("Updated Midterm");
    });

    it("canvas_delete_assignment deletes from assignment endpoint", async () => {
        const del = vi.fn().mockResolvedValue({ id: 20, workflow_state: "deleted" });
        const tool = findTool("canvas_delete_assignment");
        const result = await tool.handler(
            { course_id: 5, assignment_id: 20 },
            { canvas: fakeCanvas({ delete: del }) },
        );
        expect(del).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignments/20",
        );
        expect(result.content[0].text).toContain("deleted");
    });

    it("canvas_create_assignment_group posts to assignment_groups endpoint", async () => {
        const post = vi.fn().mockResolvedValue({ id: 7, name: "Projects" });
        const tool = findTool("canvas_create_assignment_group");
        const result = await tool.handler(
            { course_id: 5, name: "Projects", group_weight: 40 },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignment_groups",
            expect.objectContaining({ name: "Projects", group_weight: 40 }),
        );
        expect(result.content[0].text).toContain("Projects");
    });

    it("canvas_bulk_update_assignment_dates puts to bulk_update endpoint", async () => {
        const put = vi.fn().mockResolvedValue({ progress: "queued" });
        const tool = findTool("canvas_bulk_update_assignment_dates");
        const dates = [{ id: 10, due_at: "2026-05-01T12:00:00Z" }];
        const result = await tool.handler(
            { course_id: 5, assignment_dates: dates },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignments/bulk_update",
            dates,
        );
        expect(result.content[0].text).toContain("queued");
    });

    it("canvas_assign_peer_review posts to peer_reviews endpoint", async () => {
        const post = vi.fn().mockResolvedValue({ id: 42, workflow_state: "assigned" });
        const tool = findTool("canvas_assign_peer_review");
        const result = await tool.handler(
            { course_id: 5, assignment_id: 20, reviewer_id: 101, reviewee_id: 102 },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/5/assignments/20/peer_reviews",
            expect.objectContaining({ user_id: 101, reviewee_id: 102 }),
        );
        expect(result.content[0].text).toContain("assigned");
    });

});
