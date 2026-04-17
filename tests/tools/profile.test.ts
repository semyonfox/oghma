import { describe, it, expect, vi } from "vitest";
import { profileTools } from "../../src/tools/profile.js";
import type { CanvasClient } from "../../src/canvas/client.js";

function findTool(name: string) {
    const tool = profileTools.find((t) => t.name === name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    return tool;
}

function fakeCanvas(overrides: Partial<CanvasClient>): CanvasClient {
    return overrides as unknown as CanvasClient;
}

describe("profile tools", () => {
    it("canvas_get_my_profile calls get for self profile endpoint", async () => {
        const get = vi.fn().mockResolvedValue({ id: 42, name: "Jane Student", login_id: "jane@example.com" });
        const tool = findTool("canvas_get_my_profile");
        const result = await tool.handler(
            {},
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith("/api/v1/users/self/profile", {});
        expect(result.content[0].text).toContain("Jane Student");
    });

    it("canvas_get_user_profile calls get with user_id", async () => {
        const get = vi.fn().mockResolvedValue({ id: 99, name: "Other Student", login_id: "other@example.com" });
        const tool = findTool("canvas_get_user_profile");
        const result = await tool.handler(
            { user_id: 99 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith("/api/v1/users/99/profile", {});
        expect(result.content[0].text).toContain("Other Student");
    });

    it("canvas_get_my_settings calls get for settings endpoint", async () => {
        const get = vi.fn().mockResolvedValue({ manual_mark_as_read: false, collapse_global_nav: true });
        const tool = findTool("canvas_get_my_settings");
        const result = await tool.handler(
            {},
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith("/api/v1/users/self/settings", {});
        expect(result.content[0].text).toContain("collapse_global_nav");
    });

    it("canvas_update_user_profile calls put with user wrapper", async () => {
        const updated = { id: 7, name: "Updated Name", short_name: "Updated", bio: "Bio text" };
        const put = vi.fn().mockResolvedValue(updated);
        const tool = findTool("canvas_update_user_profile");
        const result = await tool.handler(
            { user_id: 7, name: "Updated Name", short_name: "Updated", bio: "Bio text" },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith("/api/v1/users/7", {
            user: { name: "Updated Name", short_name: "Updated", bio: "Bio text" },
        });
        expect(result.content[0].text).toContain("Updated Name");
    });

    it("canvas_update_my_settings calls put with settings payload", async () => {
        const updated = { manual_mark_as_read: true, collapse_global_nav: false };
        const put = vi.fn().mockResolvedValue(updated);
        const tool = findTool("canvas_update_my_settings");
        const result = await tool.handler(
            { manual_mark_as_read: true },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith("/api/v1/users/self/settings", { manual_mark_as_read: true });
        expect(result.content[0].text).toContain("manual_mark_as_read");
    });

    it("canvas_create_user calls post with user and pseudonym", async () => {
        const created = { id: 55, name: "New User", login_id: "newuser@example.com" };
        const post = vi.fn().mockResolvedValue(created);
        const tool = findTool("canvas_create_user");
        const result = await tool.handler(
            { account_id: 1, name: "New User", login_id: "newuser@example.com" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith("/api/v1/accounts/1/users", {
            user: { name: "New User" },
            pseudonym: { unique_id: "newuser@example.com" },
        });
        expect(result.content[0].text).toContain("New User");
    });
});
