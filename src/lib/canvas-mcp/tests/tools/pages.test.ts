import { describe, it, expect, vi } from "vitest";
import { pageTools } from "../../src/tools/pages.js";
import type { CanvasClient } from "../../src/canvas/client.js";

function findTool(name: string) {
    const tool = pageTools.find((t) => t.name === name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    return tool;
}

function fakeCanvas(overrides: Partial<CanvasClient>): CanvasClient {
    return overrides as unknown as CanvasClient;
}

describe("page tools", () => {
    it("canvas_list_pages calls collectPaginated for a course", async () => {
        const collect = vi.fn().mockResolvedValue([{ url: "syllabus", title: "Syllabus" }]);
        const tool = findTool("canvas_list_pages");
        const result = await tool.handler(
            { course_id: 10 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/10/pages",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("Syllabus");
    });

    it("canvas_list_pages passes optional sort and search_term", async () => {
        const collect = vi.fn().mockResolvedValue([{ url: "intro", title: "Intro" }]);
        const tool = findTool("canvas_list_pages");
        await tool.handler(
            { course_id: 10, sort: "title", search_term: "intro" },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/10/pages",
            expect.objectContaining({ sort: "title", search_term: "intro" }),
        );
    });

    it("canvas_get_page fetches a single page by url slug", async () => {
        const get = vi.fn().mockResolvedValue({ url: "week-1", title: "Week 1", body: "<p>hello</p>" });
        const tool = findTool("canvas_get_page");
        const result = await tool.handler(
            { course_id: 10, page_url: "week-1" },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/10/pages/week-1",
            {},
        );
        expect(result.content[0].text).toContain("Week 1");
    });

    it("canvas_get_front_page fetches the course front page", async () => {
        const get = vi.fn().mockResolvedValue({ url: "home", title: "Home", body: "<p>welcome</p>" });
        const tool = findTool("canvas_get_front_page");
        const result = await tool.handler(
            { course_id: 10 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/10/front_page",
            {},
        );
        expect(result.content[0].text).toContain("Home");
    });

    it("canvas_list_page_revisions calls collectPaginated for a page", async () => {
        const collect = vi.fn().mockResolvedValue([{ revision_id: 3, updated_at: "2024-01-01" }]);
        const tool = findTool("canvas_list_page_revisions");
        const result = await tool.handler(
            { course_id: 10, page_url: "week-1" },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/10/pages/week-1/revisions",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("revision_id");
    });

    it("canvas_get_page_revision fetches a specific revision", async () => {
        const get = vi.fn().mockResolvedValue({ revision_id: 2, title: "Week 1 v2", body: "<p>updated</p>" });
        const tool = findTool("canvas_get_page_revision");
        const result = await tool.handler(
            { course_id: 10, page_url: "week-1", revision_id: 2 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/10/pages/week-1/revisions/2",
            expect.any(Object),
        );
        expect(result.content[0].text).toContain("Week 1 v2");
    });

    it("canvas_create_page posts a new page with title and optional fields", async () => {
        const post = vi.fn().mockResolvedValue({ url: "new-page", title: "New Page", published: true });
        const tool = findTool("canvas_create_page");
        const result = await tool.handler(
            { course_id: 10, title: "New Page", body: "<p>content</p>", published: true },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/10/pages",
            expect.objectContaining({
                wiki_page: expect.objectContaining({ title: "New Page", body: "<p>content</p>", published: true }),
            }),
        );
        expect(result.content[0].text).toContain("New Page");
    });

    it("canvas_update_page puts updated fields for an existing page", async () => {
        const put = vi.fn().mockResolvedValue({ url: "week-1", title: "Week 1 Updated", published: false });
        const tool = findTool("canvas_update_page");
        const result = await tool.handler(
            { course_id: 10, page_url: "week-1", title: "Week 1 Updated", published: false },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/courses/10/pages/week-1",
            expect.objectContaining({
                wiki_page: expect.objectContaining({ title: "Week 1 Updated", published: false }),
            }),
        );
        expect(result.content[0].text).toContain("Week 1 Updated");
    });

    it("canvas_delete_page deletes a page by url slug", async () => {
        const del = vi.fn().mockResolvedValue({ deleted: true });
        const tool = findTool("canvas_delete_page");
        const result = await tool.handler(
            { course_id: 10, page_url: "week-1" },
            { canvas: fakeCanvas({ delete: del }) },
        );
        expect(del).toHaveBeenCalledWith("/api/v1/courses/10/pages/week-1");
        expect(result.content[0].text).toContain("deleted");
    });

    it("canvas_revert_page_revision posts to the revision endpoint", async () => {
        const post = vi.fn().mockResolvedValue({ revision_id: 1, title: "Week 1 original" });
        const tool = findTool("canvas_revert_page_revision");
        const result = await tool.handler(
            { course_id: 10, page_url: "week-1", revision_id: 1 },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/10/pages/week-1/revisions/1",
        );
        expect(result.content[0].text).toContain("revision_id");
    });
});
