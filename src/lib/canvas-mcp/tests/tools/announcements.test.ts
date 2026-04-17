import { describe, it, expect, vi } from "vitest";
import { announcementTools } from "../../src/tools/announcements.js";
import type { CanvasClient } from "../../src/canvas/client.js";

function findTool(name: string) {
    const tool = announcementTools.find((t) => t.name === name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    return tool;
}

function fakeCanvas(overrides: Partial<CanvasClient>): CanvasClient {
    return overrides as unknown as CanvasClient;
}

describe("announcement tools", () => {
    it("canvas_list_announcements calls collectPaginated with context_codes", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 1, title: "Welcome!" }]);
        const tool = findTool("canvas_list_announcements");
        const result = await tool.handler(
            { context_codes: ["course_123"] },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/announcements",
            expect.objectContaining({
                per_page: 100,
                context_codes: ["course_123"],
            }),
        );
        expect(result.content[0].text).toContain("Welcome!");
    });

    it("canvas_list_announcements passes optional date filters and active_only", async () => {
        const collect = vi.fn().mockResolvedValue([]);
        const tool = findTool("canvas_list_announcements");
        await tool.handler(
            {
                context_codes: ["course_456"],
                start_date: "2024-09-01",
                end_date: "2024-12-31",
                active_only: true,
            },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/announcements",
            expect.objectContaining({
                context_codes: ["course_456"],
                start_date: "2024-09-01",
                end_date: "2024-12-31",
                active_only: true,
            }),
        );
    });

    it("canvas_list_course_announcements calls collectPaginated for the course", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 2, title: "Assignment due" }]);
        const tool = findTool("canvas_list_course_announcements");
        const result = await tool.handler(
            { course_id: 42 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/42/discussion_topics",
            expect.objectContaining({
                per_page: 100,
                only_announcements: true,
            }),
        );
        expect(result.content[0].text).toContain("Assignment due");
    });

    it("canvas_get_announcement calls get for a specific topic", async () => {
        const get = vi.fn().mockResolvedValue({ id: 7, title: "Exam info", is_announcement: true });
        const tool = findTool("canvas_get_announcement");
        const result = await tool.handler(
            { course_id: 10, announcement_id: 7 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/10/discussion_topics/7",
            {},
        );
        expect(result.content[0].text).toContain("Exam info");
    });

    it("canvas_list_account_notifications calls get for account notifications", async () => {
        const get = vi.fn().mockResolvedValue([{ id: 3, subject: "System maintenance" }]);
        const tool = findTool("canvas_list_account_notifications");
        const result = await tool.handler(
            {},
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith("/api/v1/accounts/self/account_notifications", {});
        expect(result.content[0].text).toContain("System maintenance");
    });

    it("canvas_create_announcement calls post with is_announcement and required fields", async () => {
        const post = vi.fn().mockResolvedValue({ id: 99, title: "New Announcement", is_announcement: true });
        const tool = findTool("canvas_create_announcement");
        const result = await tool.handler(
            { course_id: 5, title: "New Announcement", message: "Hello class" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/5/discussion_topics",
            expect.objectContaining({
                is_announcement: true,
                title: "New Announcement",
                message: "Hello class",
            }),
        );
        expect(result.content[0].text).toContain("New Announcement");
    });

    it("canvas_create_announcement passes delayed_post_at when provided", async () => {
        const post = vi.fn().mockResolvedValue({ id: 100, title: "Delayed" });
        const tool = findTool("canvas_create_announcement");
        await tool.handler(
            { course_id: 5, title: "Delayed", message: "Coming soon", delayed_post_at: "2025-01-01T09:00:00Z" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/5/discussion_topics",
            expect.objectContaining({ delayed_post_at: "2025-01-01T09:00:00Z" }),
        );
    });

    it("canvas_delete_announcement calls delete with correct endpoint", async () => {
        const del = vi.fn().mockResolvedValue({ deleted: true });
        const tool = findTool("canvas_delete_announcement");
        const result = await tool.handler(
            { course_id: 10, announcement_id: 42 },
            { canvas: fakeCanvas({ delete: del }) },
        );
        expect(del).toHaveBeenCalledWith(
            "/api/v1/courses/10/discussion_topics/42",
        );
        expect(result.content[0].text).toContain("deleted");
    });

    it("canvas_bulk_delete_announcements calls delete for each id", async () => {
        const del = vi.fn().mockResolvedValue({ deleted: true });
        const tool = findTool("canvas_bulk_delete_announcements");
        const result = await tool.handler(
            { course_id: 20, announcement_ids: [1, 2, 3] },
            { canvas: fakeCanvas({ delete: del }) },
        );
        expect(del).toHaveBeenCalledTimes(3);
        expect(del).toHaveBeenCalledWith("/api/v1/courses/20/discussion_topics/1");
        expect(del).toHaveBeenCalledWith("/api/v1/courses/20/discussion_topics/2");
        expect(del).toHaveBeenCalledWith("/api/v1/courses/20/discussion_topics/3");
        expect(result.content[0].text).toContain("deleted");
    });
});
