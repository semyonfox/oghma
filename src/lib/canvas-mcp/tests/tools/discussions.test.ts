import { describe, it, expect, vi } from "vitest";
import { discussionTools } from "../../src/tools/discussions.js";
import type { CanvasClient } from "../../src/canvas/client.js";

function findTool(name: string) {
    const tool = discussionTools.find((t) => t.name === name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    return tool;
}

function fakeCanvas(overrides: Partial<CanvasClient>): CanvasClient {
    return overrides as unknown as CanvasClient;
}

describe("discussion tools", () => {
    it("canvas_list_discussion_topics calls collectPaginated for a course", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 1, title: "Week 1 Discussion" }]);
        const tool = findTool("canvas_list_discussion_topics");
        const result = await tool.handler(
            { course_id: 10 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/10/discussion_topics",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("Week 1 Discussion");
    });

    it("canvas_list_discussion_topics passes optional filters", async () => {
        const collect = vi.fn().mockResolvedValue([]);
        const tool = findTool("canvas_list_discussion_topics");
        await tool.handler(
            { course_id: 10, search_term: "ethics", include: ["sections"] },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/10/discussion_topics",
            expect.objectContaining({
                per_page: 100,
                search_term: "ethics",
                include: ["sections"],
            }),
        );
    });

    it("canvas_get_discussion_topic calls get for a topic", async () => {
        const get = vi.fn().mockResolvedValue({ id: 5, title: "Group project" });
        const tool = findTool("canvas_get_discussion_topic");
        const result = await tool.handler(
            { course_id: 10, topic_id: 5 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/10/discussion_topics/5",
            {},
        );
        expect(result.content[0].text).toContain("Group project");
    });

    it("canvas_get_discussion_view calls get for the threaded view", async () => {
        const get = vi.fn().mockResolvedValue({ participants: [], view: [] });
        const tool = findTool("canvas_get_discussion_view");
        const result = await tool.handler(
            { course_id: 10, topic_id: 5 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/10/discussion_topics/5/view",
            {},
        );
        expect(result.content[0].text).toContain("participants");
    });

    it("canvas_list_discussion_entries calls collectPaginated for entries", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 100, message: "Great point!" }]);
        const tool = findTool("canvas_list_discussion_entries");
        const result = await tool.handler(
            { course_id: 10, topic_id: 5 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/10/discussion_topics/5/entries",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("Great point!");
    });

    it("canvas_get_discussion_entry calls get for a single entry", async () => {
        const get = vi.fn().mockResolvedValue({ id: 100, message: "Hello world" });
        const tool = findTool("canvas_get_discussion_entry");
        const result = await tool.handler(
            { course_id: 10, topic_id: 5, entry_id: 100 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/courses/10/discussion_topics/5/entries/100",
            {},
        );
        expect(result.content[0].text).toContain("Hello world");
    });

    it("canvas_create_discussion_topic posts a new topic", async () => {
        const post = vi.fn().mockResolvedValue({ id: 42, title: "New Topic" });
        const tool = findTool("canvas_create_discussion_topic");
        const result = await tool.handler(
            { course_id: 10, title: "New Topic", message: "Body text" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/10/discussion_topics",
            expect.objectContaining({ title: "New Topic", message: "Body text" }),
        );
        expect(result.content[0].text).toContain("New Topic");
    });

    it("canvas_create_discussion_topic includes discussion_type when provided", async () => {
        const post = vi.fn().mockResolvedValue({ id: 43, title: "Threaded" });
        const tool = findTool("canvas_create_discussion_topic");
        await tool.handler(
            { course_id: 10, title: "Threaded", message: "Body", discussion_type: "threaded" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/10/discussion_topics",
            expect.objectContaining({ discussion_type: "threaded" }),
        );
    });

    it("canvas_post_discussion_entry posts a top-level entry", async () => {
        const post = vi.fn().mockResolvedValue({ id: 200, message: "My reply" });
        const tool = findTool("canvas_post_discussion_entry");
        const result = await tool.handler(
            { course_id: 10, topic_id: 5, message: "My reply" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/10/discussion_topics/5/entries",
            { message: "My reply" },
        );
        expect(result.content[0].text).toContain("My reply");
    });

    it("canvas_reply_to_discussion_entry posts a nested reply", async () => {
        const post = vi.fn().mockResolvedValue({ id: 300, message: "Nested reply" });
        const tool = findTool("canvas_reply_to_discussion_entry");
        const result = await tool.handler(
            { course_id: 10, topic_id: 5, entry_id: 100, message: "Nested reply" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/courses/10/discussion_topics/5/entries/100/replies",
            { message: "Nested reply" },
        );
        expect(result.content[0].text).toContain("Nested reply");
    });

    it("canvas_delete_discussion_topic calls delete for a topic", async () => {
        const del = vi.fn().mockResolvedValue({ deleted: true });
        const tool = findTool("canvas_delete_discussion_topic");
        const result = await tool.handler(
            { course_id: 10, topic_id: 5 },
            { canvas: fakeCanvas({ delete: del }) },
        );
        expect(del).toHaveBeenCalledWith(
            "/api/v1/courses/10/discussion_topics/5",
        );
        expect(result.content[0].text).toContain("deleted");
    });
});
