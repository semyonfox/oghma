import { describe, expect, it } from "vitest";
import {
  canvasMcpStudentToolNames,
  canvasMcpToolSchemas,
  disabledCanvasMcpToolNames,
} from "@/lib/canvas/mcp";

describe("canvas MCP student profile", () => {
  it("keeps core student tools enabled", () => {
    expect(canvasMcpStudentToolNames).toContain("canvas_list_courses");
    expect(canvasMcpStudentToolNames).toContain("canvas_list_assignments");
    expect(canvasMcpStudentToolNames).toContain("canvas_submit_assignment");
    expect(canvasMcpStudentToolNames).toContain("canvas_start_quiz_attempt");
    expect(canvasMcpStudentToolNames).toContain("canvas_send_conversation");
  });

  it("disables instructor and admin tools", () => {
    for (const disabled of disabledCanvasMcpToolNames) {
      expect(canvasMcpStudentToolNames).not.toContain(disabled);
    }
  });

  it("builds schemas only for enabled tools", () => {
    const schemaToolNames = Object.keys(canvasMcpToolSchemas);

    expect(schemaToolNames.length).toBe(canvasMcpStudentToolNames.length);
    expect(schemaToolNames.length).toBeGreaterThan(60);

    for (const disabled of disabledCanvasMcpToolNames) {
      expect(canvasMcpToolSchemas[disabled]).toBeUndefined();
    }
  });
});
