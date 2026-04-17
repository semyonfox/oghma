import { describe, it, expect, vi } from "vitest";
import { notificationTools } from "../../src/tools/notifications.js";
import type { CanvasClient } from "../../src/canvas/client.js";

function findTool(name: string) {
    const tool = notificationTools.find((t) => t.name === name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    return tool;
}

function fakeCanvas(overrides: Partial<CanvasClient>): CanvasClient {
    return overrides as unknown as CanvasClient;
}

describe("notification tools", () => {
    it("canvas_list_activity_stream calls collectPaginated", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 1, type: "Announcement", title: "Welcome" }]);
        const tool = findTool("canvas_list_activity_stream");
        const result = await tool.handler(
            {},
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/users/self/activity_stream",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("Welcome");
    });

    it("canvas_list_activity_stream passes only_active_courses filter", async () => {
        const collect = vi.fn().mockResolvedValue([]);
        const tool = findTool("canvas_list_activity_stream");
        await tool.handler(
            { only_active_courses: true },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/users/self/activity_stream",
            expect.objectContaining({ only_active_courses: true }),
        );
    });

    it("canvas_get_activity_stream_summary calls get for summary endpoint", async () => {
        const get = vi.fn().mockResolvedValue([{ type: "Announcement", count: 3, unread_count: 1 }]);
        const tool = findTool("canvas_get_activity_stream_summary");
        const result = await tool.handler(
            {},
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith("/api/v1/users/self/activity_stream/summary", {});
        expect(result.content[0].text).toContain("Announcement");
    });

    it("canvas_list_communication_channels calls get for channels endpoint", async () => {
        const get = vi.fn().mockResolvedValue([{ id: 1, type: "email", address: "student@example.com" }]);
        const tool = findTool("canvas_list_communication_channels");
        const result = await tool.handler(
            {},
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith("/api/v1/users/self/communication_channels", {});
        expect(result.content[0].text).toContain("student@example.com");
    });

    it("canvas_dismiss_account_notification calls delete with notification id", async () => {
        const del = vi.fn().mockResolvedValue({ success: true });
        const tool = findTool("canvas_dismiss_account_notification");
        const result = await tool.handler(
            { notification_id: 42 },
            { canvas: fakeCanvas({ delete: del }) },
        );
        expect(del).toHaveBeenCalledWith(
            "/api/v1/accounts/self/account_notifications/42",
        );
        expect(result.content[0].text).toContain("true");
    });

    it("canvas_update_notification_preference calls put with channel and preference", async () => {
        const put = vi.fn().mockResolvedValue({ notification_preferences: { frequency: "daily" } });
        const tool = findTool("canvas_update_notification_preference");
        const result = await tool.handler(
            { channel_id: 7, notification: "assignment_due_date", frequency: "daily" },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/users/self/communication_channels/7/notification_preferences/assignment_due_date",
            { notification_preferences: { frequency: "daily" } },
        );
        expect(result.content[0].text).toContain("daily");
    });
});
