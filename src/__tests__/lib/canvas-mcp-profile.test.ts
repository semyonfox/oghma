import { describe, expect, it, vi } from "vitest";
import {
  canvasMcpStudentTools,
  canvasMcpToolSchemas,
  disabledCanvasMcpToolNames,
} from "@/lib/canvas/mcp";
import { isReadOnlyCanvasTool } from "@/lib/canvas/tool-policy";
import { CanvasClient } from "@/lib/canvas-mcp/src/canvas/client";
import { allTools } from "@/lib/canvas-mcp/src/tools";
import { executeTool } from "@/lib/canvas-mcp/src/tools/types";

const studentToolNames = canvasMcpStudentTools.map((tool) => tool.name);

// enough to satisfy any read tool's required inputs. z.object strips the rest
const sampleArgs = {
  course_id: "1",
  assignment_id: "2",
  module_id: "3",
  item_id: "4",
  asset_type: "ModuleItem",
  asset_id: "4",
  page_url: "week-1",
  revision_id: "5",
  topic_id: "6",
  entry_id: "7",
  announcement_id: "6",
  file_id: "8",
  folder_id: "9",
  quiz_id: "10",
  rubric_id: "11",
  conversation_id: "12",
  user_id: "13",
  section_id: "14",
  context_codes: ["course_1"],
};

describe("canvas MCP student profile", () => {
  it("keeps core student tools enabled", () => {
    expect(studentToolNames).toContain("canvas_list_courses");
    expect(studentToolNames).toContain("canvas_list_assignments");
    expect(studentToolNames).toContain("canvas_submit_assignment");
    expect(studentToolNames).toContain("canvas_start_quiz_attempt");
    expect(studentToolNames).toContain("canvas_send_conversation");
  });

  it("disables instructor and admin tools that really exist", () => {
    const registered = new Set(allTools.map((tool) => tool.name));
    for (const disabled of disabledCanvasMcpToolNames) {
      // a misspelt name would leave the real tool enabled
      expect(registered.has(disabled), disabled).toBe(true);
      expect(studentToolNames).not.toContain(disabled);
    }
  });

  it("builds schemas only for enabled tools", () => {
    const schemaToolNames = Object.keys(canvasMcpToolSchemas);

    expect(schemaToolNames).toEqual(studentToolNames);
    for (const disabled of disabledCanvasMcpToolNames) {
      expect(canvasMcpToolSchemas[disabled]).toBeUndefined();
    }
  });

  it("only skips confirmation for tools that send nothing but GETs", async () => {
    const readOnly = canvasMcpStudentTools.filter((tool) =>
      isReadOnlyCanvasTool(tool.name),
    );
    expect(readOnly.length).toBeGreaterThan(50);

    for (const tool of readOnly) {
      const fetch = vi.fn(
        async () => new Response("[]", { status: 200 }),
      );
      const canvas = new CanvasClient({
        domain: "school.instructure.com",
        token: "t",
        fetch,
      });

      await executeTool(tool, tool.inputSchema.parse(sampleArgs), { canvas });

      expect(fetch, tool.name).toHaveBeenCalled();
      for (const call of fetch.mock.calls as unknown as Array<
        [string, RequestInit]
      >) {
        expect(call[1].method, tool.name).toBe("GET");
      }
    }
  });

  it("asks for confirmation before every student write", () => {
    const writes = canvasMcpStudentTools
      .filter((tool) => !isReadOnlyCanvasTool(tool.name))
      .map((tool) => tool.name);

    expect(writes).toEqual(
      expect.arrayContaining([
        "canvas_submit_assignment",
        "canvas_send_conversation",
        "canvas_reply_to_conversation",
        "canvas_delete_conversation",
        "canvas_post_discussion_entry",
        "canvas_start_quiz_attempt",
        "canvas_update_user_profile",
      ]),
    );
  });
});
