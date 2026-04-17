import { describe, it, expect, vi } from "vitest";
import { calendarTools } from "../../src/tools/calendar.js";
import type { CanvasClient } from "../../src/canvas/client.js";

function findTool(name: string) {
    const tool = calendarTools.find((t) => t.name === name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    return tool;
}

function fakeCanvas(overrides: Partial<CanvasClient>): CanvasClient {
    return overrides as unknown as CanvasClient;
}

describe("calendar tools", () => {
    it("canvas_list_calendar_events calls collectPaginated", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 1, title: "Lecture", type: "event" }]);
        const tool = findTool("canvas_list_calendar_events");
        const result = await tool.handler(
            {},
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/calendar_events",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("Lecture");
    });

    it("canvas_list_calendar_events passes context_codes, dates, and type", async () => {
        const collect = vi.fn().mockResolvedValue([]);
        const tool = findTool("canvas_list_calendar_events");
        await tool.handler(
            {
                context_codes: ["course_123", "course_456"],
                start_date: "2024-09-01",
                end_date: "2024-12-31",
                type: "assignment",
            },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/calendar_events",
            expect.objectContaining({
                context_codes: ["course_123", "course_456"],
                start_date: "2024-09-01",
                end_date: "2024-12-31",
                type: "assignment",
            }),
        );
    });

    it("canvas_list_upcoming_events calls get for upcoming events", async () => {
        const get = vi.fn().mockResolvedValue([{ id: 2, title: "Quiz due", type: "assignment" }]);
        const tool = findTool("canvas_list_upcoming_events");
        const result = await tool.handler(
            {},
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith("/api/v1/users/self/upcoming_events");
        expect(result.content[0].text).toContain("Quiz due");
    });

    it("canvas_list_upcoming_events filters by type client-side", async () => {
        const get = vi.fn().mockResolvedValue([
            { id: 1, title: "Quiz", type: "assignment" },
            { id: 2, title: "Office hours", type: "event" },
        ]);
        const tool = findTool("canvas_list_upcoming_events");
        const result = await tool.handler({ type: "event" }, { canvas: fakeCanvas({ get }) });
        const parsed = JSON.parse(result.content[0].text) as Array<{ type: string }>;
        expect(parsed).toHaveLength(1);
        expect(parsed[0].type).toBe("event");
    });

    it("canvas_list_upcoming_events applies limit after filtering", async () => {
        const get = vi.fn().mockResolvedValue([
            { id: 1, type: "assignment" },
            { id: 2, type: "assignment" },
            { id: 3, type: "assignment" },
        ]);
        const tool = findTool("canvas_list_upcoming_events");
        const result = await tool.handler({ limit: 2 }, { canvas: fakeCanvas({ get }) });
        const parsed = JSON.parse(result.content[0].text) as unknown[];
        expect(parsed).toHaveLength(2);
    });

    it("canvas_list_planner_items calls collectPaginated", async () => {
        const collect = vi.fn().mockResolvedValue([{ plannable_id: 10, plannable_type: "assignment" }]);
        const tool = findTool("canvas_list_planner_items");
        const result = await tool.handler(
            {},
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/planner/items",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("plannable_id");
    });

    it("canvas_list_planner_items passes start_date, end_date, and context_codes", async () => {
        const collect = vi.fn().mockResolvedValue([]);
        const tool = findTool("canvas_list_planner_items");
        await tool.handler(
            {
                start_date: "2024-09-01",
                end_date: "2024-10-01",
                context_codes: ["course_99"],
            },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/planner/items",
            expect.objectContaining({
                start_date: "2024-09-01",
                end_date: "2024-10-01",
                context_codes: ["course_99"],
            }),
        );
    });

    it("canvas_list_todo_items calls get for todo list", async () => {
        const get = vi.fn().mockResolvedValue([{ type: "submitting", assignment: { name: "Essay" } }]);
        const tool = findTool("canvas_list_todo_items");
        const result = await tool.handler(
            {},
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith("/api/v1/users/self/todo", {});
        expect(result.content[0].text).toContain("Essay");
    });

    // admin / educator tools

    it("canvas_create_calendar_event posts to calendar_events", async () => {
        const post = vi.fn().mockResolvedValue({ id: 10, title: "Staff meeting" });
        const tool = findTool("canvas_create_calendar_event");
        const result = await tool.handler(
            { context_code: "course_1", title: "Staff meeting" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/calendar_events",
            expect.objectContaining({
                calendar_event: expect.objectContaining({
                    context_code: "course_1",
                    title: "Staff meeting",
                }),
            }),
        );
        expect(result.content[0].text).toContain("Staff meeting");
    });

    it("canvas_create_calendar_event includes optional fields when provided", async () => {
        const post = vi.fn().mockResolvedValue({ id: 11 });
        const tool = findTool("canvas_create_calendar_event");
        await tool.handler(
            {
                context_code: "course_1",
                title: "Lecture",
                start_at: "2024-09-01T09:00:00Z",
                end_at: "2024-09-01T10:00:00Z",
                description: "Intro lecture",
                location_name: "Room 101",
            },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/calendar_events",
            expect.objectContaining({
                calendar_event: expect.objectContaining({
                    start_at: "2024-09-01T09:00:00Z",
                    end_at: "2024-09-01T10:00:00Z",
                    description: "Intro lecture",
                    location_name: "Room 101",
                }),
            }),
        );
    });

    it("canvas_update_calendar_event puts to calendar_events/:id", async () => {
        const put = vi.fn().mockResolvedValue({ id: 10, title: "Updated title" });
        const tool = findTool("canvas_update_calendar_event");
        const result = await tool.handler(
            { event_id: 10, title: "Updated title" },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/calendar_events/10",
            expect.objectContaining({
                calendar_event: expect.objectContaining({ title: "Updated title" }),
            }),
        );
        expect(result.content[0].text).toContain("Updated title");
    });

    it("canvas_update_calendar_event omits missing optional fields", async () => {
        const put = vi.fn().mockResolvedValue({ id: 10 });
        const tool = findTool("canvas_update_calendar_event");
        await tool.handler(
            { event_id: 10 },
            { canvas: fakeCanvas({ put }) },
        );
        const body = (put.mock.calls[0] as [string, { calendar_event: Record<string, unknown> }])[1];
        expect(Object.keys(body.calendar_event)).toHaveLength(0);
    });

    it("canvas_delete_calendar_event deletes calendar_events/:id", async () => {
        const del = vi.fn().mockResolvedValue({ deleted: true });
        const tool = findTool("canvas_delete_calendar_event");
        const result = await tool.handler(
            { event_id: 42 },
            { canvas: fakeCanvas({ delete: del }) },
        );
        expect(del).toHaveBeenCalledWith("/api/v1/calendar_events/42");
        expect(result.content[0].text).toContain("deleted");
    });

    it("canvas_create_planner_note posts to planner_notes", async () => {
        const post = vi.fn().mockResolvedValue({ id: 5, title: "Review slides" });
        const tool = findTool("canvas_create_planner_note");
        const result = await tool.handler(
            { title: "Review slides" },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/planner_notes",
            expect.objectContaining({ title: "Review slides" }),
        );
        expect(result.content[0].text).toContain("Review slides");
    });

    it("canvas_create_planner_note includes optional fields when provided", async () => {
        const post = vi.fn().mockResolvedValue({ id: 6 });
        const tool = findTool("canvas_create_planner_note");
        await tool.handler(
            {
                title: "Note",
                details: "Some details",
                todo_date: "2024-10-01",
                course_id: 99,
            },
            { canvas: fakeCanvas({ post }) },
        );
        expect(post).toHaveBeenCalledWith(
            "/api/v1/planner_notes",
            expect.objectContaining({
                details: "Some details",
                todo_date: "2024-10-01",
                course_id: 99,
            }),
        );
    });

    it("canvas_update_planner_note puts to planner_notes/:id", async () => {
        const put = vi.fn().mockResolvedValue({ id: 5, title: "Updated note" });
        const tool = findTool("canvas_update_planner_note");
        const result = await tool.handler(
            { note_id: 5, title: "Updated note" },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/planner_notes/5",
            expect.objectContaining({ title: "Updated note" }),
        );
        expect(result.content[0].text).toContain("Updated note");
    });

    it("canvas_update_planner_note omits missing optional fields", async () => {
        const put = vi.fn().mockResolvedValue({ id: 5 });
        const tool = findTool("canvas_update_planner_note");
        await tool.handler(
            { note_id: 5 },
            { canvas: fakeCanvas({ put }) },
        );
        const body = (put.mock.calls[0] as [string, Record<string, unknown>])[1];
        expect(Object.keys(body)).toHaveLength(0);
    });

    it("canvas_delete_planner_note deletes planner_notes/:id", async () => {
        const del = vi.fn().mockResolvedValue({ deleted: true });
        const tool = findTool("canvas_delete_planner_note");
        const result = await tool.handler(
            { note_id: 7 },
            { canvas: fakeCanvas({ delete: del }) },
        );
        expect(del).toHaveBeenCalledWith("/api/v1/planner_notes/7");
        expect(result.content[0].text).toContain("deleted");
    });

    it("canvas_mark_planner_item_complete puts override with marked_complete", async () => {
        const put = vi.fn().mockResolvedValue({ id: 3, marked_complete: true });
        const tool = findTool("canvas_mark_planner_item_complete");
        const result = await tool.handler(
            { override_id: 3, marked_complete: true },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/planner/overrides/3",
            expect.objectContaining({ marked_complete: true }),
        );
        expect(result.content[0].text).toContain("marked_complete");
    });

    it("canvas_mark_planner_item_complete can mark incomplete", async () => {
        const put = vi.fn().mockResolvedValue({ id: 3, marked_complete: false });
        const tool = findTool("canvas_mark_planner_item_complete");
        await tool.handler(
            { override_id: 3, marked_complete: false },
            { canvas: fakeCanvas({ put }) },
        );
        expect(put).toHaveBeenCalledWith(
            "/api/v1/planner/overrides/3",
            expect.objectContaining({ marked_complete: false }),
        );
    });
});
