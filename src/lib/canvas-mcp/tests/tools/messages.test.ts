import { describe, it, expect, vi } from "vitest";
import { messageTools } from "../../src/tools/messages.js";
import type { CanvasClient } from "../../src/canvas/client.js";

function findTool(name: string) {
    const tool = messageTools.find((t) => t.name === name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    return tool;
}

function fakeCanvas(overrides: Partial<CanvasClient>): CanvasClient {
    return overrides as unknown as CanvasClient;
}

describe("message tools", () => {
    it("canvas_list_conversations calls collectPaginated", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 1, subject: "Hello" }]);
        const tool = findTool("canvas_list_conversations");
        const result = await tool.handler(
            {},
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/conversations",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("Hello");
    });

    it("canvas_list_conversations passes optional scope and filter", async () => {
        const collect = vi.fn().mockResolvedValue([]);
        const tool = findTool("canvas_list_conversations");
        await tool.handler(
            { scope: "unread", filter: ["course_10"] },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/conversations",
            expect.objectContaining({ scope: "unread", filter: ["course_10"] }),
        );
    });

    it("canvas_get_conversation fetches a single conversation", async () => {
        const get = vi.fn().mockResolvedValue({ id: 5, subject: "Assignment question" });
        const tool = findTool("canvas_get_conversation");
        const result = await tool.handler(
            { conversation_id: 5 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/conversations/5",
            expect.any(Object),
        );
        expect(result.content[0].text).toContain("Assignment question");
    });

    it("canvas_get_conversation passes optional include", async () => {
        const get = vi.fn().mockResolvedValue({ id: 5 });
        const tool = findTool("canvas_get_conversation");
        await tool.handler(
            { conversation_id: 5, include: ["participant_avatars"] },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/conversations/5",
            { include: ["participant_avatars"] },
        );
    });

    it("canvas_get_unread_count calls get for unread_count endpoint", async () => {
        const get = vi.fn().mockResolvedValue({ unread_count: 3 });
        const tool = findTool("canvas_get_unread_count");
        const result = await tool.handler(
            {},
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith("/api/v1/conversations/unread_count", {});
        expect(result.content[0].text).toContain("3");
    });

    it("canvas_mark_conversation_read calls put on the conversation endpoint", async () => {
        const put = vi.fn().mockResolvedValue({ id: 5, workflow_state: "read" });
        const tool = findTool("canvas_mark_conversation_read");
        const result = await tool.handler(
            { conversation_id: 5 },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/conversations/5",
            expect.objectContaining({ conversation: { workflow_state: "read" } }),
        );
        expect(result.content[0].text).toBeTruthy();
    });

    it("canvas_mark_conversation_read passes custom workflow_state", async () => {
        const put = vi.fn().mockResolvedValue({ id: 5, workflow_state: "archived" });
        const tool = findTool("canvas_mark_conversation_read");
        await tool.handler(
            { conversation_id: 5, workflow_state: "archived" },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/conversations/5",
            { conversation: { workflow_state: "archived" } },
        );
    });

    it("canvas_send_conversation posts a new conversation", async () => {
        const post = vi.fn().mockResolvedValue({ id: 10, subject: "Hello class" });
        const tool = findTool("canvas_send_conversation");
        const result = await tool.handler(
            { recipients: ["user_42"], body: "Welcome!", subject: "Hello class" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/conversations",
            expect.objectContaining({ recipients: ["user_42"], body: "Welcome!", subject: "Hello class" }),
        );
        expect(result.content[0].text).toContain("Hello class");
    });

    it("canvas_send_conversation omits subject and context_code when not provided", async () => {
        const post = vi.fn().mockResolvedValue({ id: 11 });
        const tool = findTool("canvas_send_conversation");
        await tool.handler(
            { recipients: ["user_7"], body: "Hi" },
            { canvas: fakeCanvas({ post }) },
        );
        const payload = post.mock.calls[0][1] as Record<string, unknown>;
        expect(payload).not.toHaveProperty("subject");
        expect(payload).not.toHaveProperty("context_code");
    });

    it("canvas_reply_to_conversation posts to add_message endpoint", async () => {
        const post = vi.fn().mockResolvedValue({ id: 5, body: "Reply text" });
        const tool = findTool("canvas_reply_to_conversation");
        const result = await tool.handler(
            { conversation_id: 5, body: "Reply text" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/conversations/5/add_message",
            expect.objectContaining({ body: "Reply text" }),
        );
        expect(result.content[0].text).toContain("Reply text");
    });

    it("canvas_reply_to_conversation passes optional recipients", async () => {
        const post = vi.fn().mockResolvedValue({ id: 5 });
        const tool = findTool("canvas_reply_to_conversation");
        await tool.handler(
            { conversation_id: 5, body: "cc you", recipients: ["user_9"] },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/conversations/5/add_message",
            expect.objectContaining({ recipients: ["user_9"] }),
        );
    });

    it("canvas_send_bulk_messages defaults bulk_message to true", async () => {
        const post = vi.fn().mockResolvedValue([{ id: 20 }, { id: 21 }]);
        const tool = findTool("canvas_send_bulk_messages");
        const result = await tool.handler(
            { recipients: ["user_1", "user_2"], body: "Broadcast" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/conversations",
            expect.objectContaining({ bulk_message: true, recipients: ["user_1", "user_2"] }),
        );
        expect(result.content[0].text).toBeTruthy();
    });

    it("canvas_send_bulk_messages respects explicit bulk_message false", async () => {
        const post = vi.fn().mockResolvedValue([{ id: 22 }]);
        const tool = findTool("canvas_send_bulk_messages");
        await tool.handler(
            { recipients: ["user_3"], body: "Single", bulk_message: false },
            { canvas: fakeCanvas({ post }) },
        );
        const payload = post.mock.calls[0][1] as Record<string, unknown>;
        expect(payload.bulk_message).toBe(false);
    });

    it("canvas_delete_conversation calls delete on the conversation endpoint", async () => {
        const del = vi.fn().mockResolvedValue({ deleted: true });
        const tool = findTool("canvas_delete_conversation");
        const result = await tool.handler(
            { conversation_id: 99 },
            { canvas: fakeCanvas({ delete: del }) },
        );
        expect(del).toHaveBeenCalledWith("/api/v1/conversations/99");
        expect(result.content[0].text).toContain("true");
    });
});
