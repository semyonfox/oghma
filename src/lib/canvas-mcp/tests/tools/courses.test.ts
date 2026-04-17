import { describe, it, expect, vi } from "vitest";
import { courseTools } from "../../src/tools/courses.js";
import type { CanvasClient } from "../../src/canvas/client.js";

function findTool(name: string) {
    const tool = courseTools.find((t) => t.name === name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    return tool;
}

function fakeCanvas(overrides: Partial<CanvasClient>): CanvasClient {
    return overrides as unknown as CanvasClient;
}

describe("course tools", () => {
    it("canvas_list_courses calls collectPaginated with filters", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 1, name: "Intro" }]);
        const tool = findTool("canvas_list_courses");
        const result = await tool.handler(
            { enrollment_state: "active" },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith("/api/v1/courses", expect.objectContaining({
            enrollment_state: "active",
            per_page: 100,
        }));
        expect(result.content[0].text).toContain("Intro");
    });

    it("canvas_get_course hits the single-course endpoint", async () => {
        const get = vi.fn().mockResolvedValue({ id: 42, name: "CT216" });
        const tool = findTool("canvas_get_course");
        const result = await tool.handler({ course_id: 42 }, { canvas: fakeCanvas({ get }) });
        expect(get).toHaveBeenCalledWith("/api/v1/courses/42", expect.any(Object));
        expect(result.content[0].text).toContain("CT216");
    });

    it("canvas_list_sections returns sections for a course", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 7, name: "Section A" }]);
        const tool = findTool("canvas_list_sections");
        const result = await tool.handler({ course_id: 42 }, { canvas: fakeCanvas({ collectPaginated: collect }) });
        expect(collect).toHaveBeenCalledWith("/api/v1/courses/42/sections", expect.any(Object));
        expect(result.content[0].text).toContain("Section A");
    });

    it("canvas_create_course posts to account endpoint with course body", async () => {
        const post = vi.fn().mockResolvedValue({ id: 99, name: "New Course", course_code: "NC101" });
        const tool = findTool("canvas_create_course");
        const result = await tool.handler(
            { account_id: 1, name: "New Course", course_code: "NC101" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/accounts/1/courses",
            expect.objectContaining({ course: expect.objectContaining({ name: "New Course", course_code: "NC101" }) }),
        );
        expect(result.content[0].text).toContain("New Course");
    });

    it("canvas_create_course omits course_code when not provided", async () => {
        const post = vi.fn().mockResolvedValue({ id: 100, name: "No Code Course" });
        const tool = findTool("canvas_create_course");
        await tool.handler(
            { account_id: 1, name: "No Code Course" },
            { canvas: fakeCanvas({ post }) },
        );
        const body = post.mock.calls[0]?.[1] as { course: Record<string, unknown> };
        expect(body.course).not.toHaveProperty("course_code");
    });
});
