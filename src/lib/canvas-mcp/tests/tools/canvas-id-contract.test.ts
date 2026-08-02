import { describe, expect, it, vi } from "vitest";
import { allTools } from "../../src/tools/index.ts";

const LARGE_ID = "9007199254740993";

function tool(name: string) {
    const found = allTools.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`Missing tool: ${name}`);
    return found;
}

describe("Canvas MCP ID contract", () => {
    it("preserves 64-bit string IDs in assignment paths", async () => {
        const get = vi.fn().mockResolvedValue({ id: LARGE_ID });
        const definition = tool("canvas_get_assignment");
        const args = definition.inputSchema.parse({ course_id: LARGE_ID, assignment_id: LARGE_ID });

        await definition.handler(args, { canvas: { get } } as never);

        expect(args).toEqual({ course_id: LARGE_ID, assignment_id: LARGE_ID });
        expect(get).toHaveBeenCalledWith(
            `/api/v1/courses/${LARGE_ID}/assignments/${LARGE_ID}`,
            {},
        );
    });

    it("normalizes only safe numeric IDs and rejects lossy numeric input", () => {
        const definition = tool("canvas_get_module");

        expect(definition.inputSchema.parse({ course_id: 42, module_id: 7 })).toEqual({
            course_id: "42",
            module_id: "7",
        });
        expect(() => definition.inputSchema.parse({ course_id: Number(LARGE_ID), module_id: 7 })).toThrow();
        expect(() => definition.inputSchema.parse({
            course_id: "9223372036854775808",
            module_id: 7,
        })).toThrow("signed 64-bit range");
    });

    it("retains Canvas's self user sentinel where that API supports it", () => {
        const definition = tool("canvas_list_my_submissions");

        expect(definition.inputSchema.parse({ course_id: LARGE_ID, student_ids: ["self", LARGE_ID] }))
            .toEqual({ course_id: LARGE_ID, student_ids: ["self", LARGE_ID] });
    });

    it("preserves large ID arrays when constructing Canvas URLs", async () => {
        const deleteRequest = vi.fn().mockResolvedValue({});
        const definition = tool("canvas_bulk_delete_announcements");
        const args = definition.inputSchema.parse({
            course_id: LARGE_ID,
            announcement_ids: [LARGE_ID, "9007199254740995"],
        });

        await definition.handler(args, { canvas: { delete: deleteRequest } } as never);

        expect(deleteRequest).toHaveBeenNthCalledWith(
            1,
            `/api/v1/courses/${LARGE_ID}/discussion_topics/${LARGE_ID}`,
        );
        expect(deleteRequest).toHaveBeenNthCalledWith(
            2,
            `/api/v1/courses/${LARGE_ID}/discussion_topics/9007199254740995`,
        );
    });
});
