import { describe, it, expect, vi } from "vitest";
import { fileTools } from "../../src/tools/files.js";
import type { CanvasClient } from "../../src/canvas/client.js";

function findTool(name: string) {
    const tool = fileTools.find((t) => t.name === name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    return tool;
}

function fakeCanvas(overrides: Partial<CanvasClient>): CanvasClient {
    return overrides as unknown as CanvasClient;
}

describe("file tools", () => {
    it("canvas_list_course_files calls collectPaginated for a course", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 1, display_name: "syllabus.pdf" }]);
        const tool = findTool("canvas_list_course_files");
        const result = await tool.handler(
            { course_id: 10 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/10/files",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("syllabus.pdf");
    });

    it("canvas_list_course_files passes optional filters", async () => {
        const collect = vi.fn().mockResolvedValue([]);
        const tool = findTool("canvas_list_course_files");
        await tool.handler(
            { course_id: 10, search_term: "notes", content_types: ["application/pdf"], sort: "name" },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/10/files",
            expect.objectContaining({
                per_page: 100,
                search_term: "notes",
                content_types: ["application/pdf"],
                sort: "name",
            }),
        );
    });

    it("canvas_list_folders calls collectPaginated for a course", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 5, name: "Lecture Slides" }]);
        const tool = findTool("canvas_list_folders");
        const result = await tool.handler(
            { course_id: 10 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/courses/10/folders",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("Lecture Slides");
    });

    it("canvas_list_folder_files calls collectPaginated for a folder", async () => {
        const collect = vi.fn().mockResolvedValue([{ id: 20, display_name: "week1.pdf" }]);
        const tool = findTool("canvas_list_folder_files");
        const result = await tool.handler(
            { folder_id: 5 },
            { canvas: fakeCanvas({ collectPaginated: collect }) },
        );
        expect(collect).toHaveBeenCalledWith(
            "/api/v1/folders/5/files",
            expect.objectContaining({ per_page: 100 }),
        );
        expect(result.content[0].text).toContain("week1.pdf");
    });

    it("canvas_get_file calls get for a single file", async () => {
        const get = vi.fn().mockResolvedValue({ id: 42, display_name: "notes.docx", url: "https://example.com/notes.docx" });
        const tool = findTool("canvas_get_file");
        const result = await tool.handler(
            { file_id: 42 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/files/42",
            {},
        );
        expect(result.content[0].text).toContain("notes.docx");
    });

    it("canvas_get_file passes optional include", async () => {
        const get = vi.fn().mockResolvedValue({ id: 42, display_name: "notes.docx" });
        const tool = findTool("canvas_get_file");
        await tool.handler(
            { file_id: 42, include: ["user", "usage_rights"] },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith(
            "/api/v1/files/42",
            { include: ["user", "usage_rights"] },
        );
    });

    it("canvas_get_file_download_url returns the url field", async () => {
        const get = vi.fn().mockResolvedValue({ id: 7, url: "https://canvas.example.com/files/7/download?token=abc" });
        const tool = findTool("canvas_get_file_download_url");
        const result = await tool.handler(
            { file_id: 7 },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith("/api/v1/files/7", {});
        expect(result.content[0].text).toContain("https://canvas.example.com/files/7/download");
    });

    // admin / educator tools

    it("canvas_upload_file is registered and returns stub guidance without crashing", async () => {
        const tool = findTool("canvas_upload_file");
        // no canvas call expected — the handler is a pure stub
        const result = await tool.handler(
            { course_id: 10, name: "lecture.pdf", size: 1024 },
            { canvas: fakeCanvas({}) },
        );
        expect(result.isError).toBeFalsy();
        const body = JSON.parse(result.content[0].text);
        expect(body.stub).toBe(true);
        expect(body.message).toContain("3-step flow");
        expect(body.message).toContain("canvas.instructure.com/doc/api/file.file_uploads.html");
        expect(body.requested_params.course_id).toBe(10);
        expect(body.requested_params.name).toBe("lecture.pdf");
    });

    it("canvas_upload_file stub includes optional params when provided", async () => {
        const tool = findTool("canvas_upload_file");
        const result = await tool.handler(
            {
                course_id: 5,
                name: "notes.docx",
                size: 2048,
                content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                parent_folder_path: "/uploads/week1",
            },
            { canvas: fakeCanvas({}) },
        );
        const body = JSON.parse(result.content[0].text);
        expect(body.requested_params.content_type).toBe(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
        expect(body.requested_params.parent_folder_path).toBe("/uploads/week1");
    });

    it("canvas_delete_file calls delete for the file", async () => {
        const del = vi.fn().mockResolvedValue({ id: 99, deleted: true });
        const tool = findTool("canvas_delete_file");
        const result = await tool.handler(
            { file_id: 99 },
            { canvas: fakeCanvas({ delete: del }) },
        );
        expect(del).toHaveBeenCalledWith("/api/v1/files/99");
        expect(result.content[0].text).toContain("deleted");
    });

    it("canvas_download_file_to_disk returns download url and does not throw", async () => {
        const get = vi.fn().mockResolvedValue({ id: 55, url: "https://canvas.example.com/files/55/download?token=xyz" });
        const tool = findTool("canvas_download_file_to_disk");
        const result = await tool.handler(
            { file_id: 55, destination_path: "/tmp/file.pdf" },
            { canvas: fakeCanvas({ get }) },
        );
        expect(get).toHaveBeenCalledWith("/api/v1/files/55", {});
        const body = JSON.parse(result.content[0].text);
        expect(body.url).toContain("https://canvas.example.com/files/55/download");
        expect(body.note).toContain("not supported");
        expect(body.destination_path_ignored).toBe("/tmp/file.pdf");
    });
});
