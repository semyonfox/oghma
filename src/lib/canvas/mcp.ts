import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodTypeAny } from "zod";
import { CanvasClient } from "@/lib/canvas-mcp/src/canvas/client";
import { allTools } from "@/lib/canvas-mcp/src/tools";
import type { ToolDef } from "@/lib/canvas-mcp/src/tools/types";

export const disabledCanvasMcpToolNames = [
  // course / assignment authoring and grading
  "canvas_create_course",
  "canvas_create_assignment",
  "canvas_update_assignment",
  "canvas_delete_assignment",
  "canvas_create_assignment_group",
  "canvas_bulk_update_assignment_dates",
  "canvas_assign_peer_review",
  "canvas_grade_submission",
  "canvas_bulk_grade_submissions",
  "canvas_post_submission_comment",
  "canvas_list_section_submissions",
  "canvas_submit_grade",
  "canvas_get_all_students_status",
  "canvas_get_comprehensive_status",

  // module / page authoring
  "canvas_create_module",
  "canvas_update_module",
  "canvas_delete_module",
  "canvas_add_module_item",
  "canvas_update_module_item",
  "canvas_delete_module_item",
  "canvas_toggle_module_publish",
  "canvas_create_page",
  "canvas_update_page",
  "canvas_delete_page",
  "canvas_revert_page_revision",

  // course-wide announcements and moderation
  "canvas_create_announcement",
  "canvas_delete_announcement",
  "canvas_bulk_delete_announcements",
  "canvas_create_discussion_topic",
  "canvas_delete_discussion_topic",

  // admin / privileged file operations
  "canvas_upload_file",
  "canvas_delete_file",
  "canvas_download_file_to_disk",

  // mass messaging and account administration
  "canvas_send_bulk_messages",
  "canvas_create_user",

  // quiz and rubric authoring / grading
  "canvas_create_quiz",
  "canvas_update_quiz",
  "canvas_delete_quiz",
  "canvas_create_quiz_question",
  "canvas_update_quiz_question",
  "canvas_delete_quiz_question",
  "canvas_create_rubric",
  "canvas_update_rubric",
  "canvas_delete_rubric",
  "canvas_associate_rubric",
  "canvas_grade_with_rubric",
] as const;

const disabledCanvasMcpToolSet = new Set<string>(disabledCanvasMcpToolNames);

export const canvasMcpStudentTools = allTools.filter(
  (tool) => !disabledCanvasMcpToolSet.has(tool.name),
);

export const canvasMcpStudentToolNames = canvasMcpStudentTools.map(
  (tool) => tool.name,
);

export const canvasMcpToolSchemas: Record<string, { inputSchema: ZodTypeAny }> =
  Object.fromEntries(
    canvasMcpStudentTools.map((tool) => [
      tool.name,
      { inputSchema: tool.inputSchema },
    ]),
  );

export const canvasToolInstruction =
  "Canvas student tools are available for course data and student actions.\n" +
  "Available categories: courses, assignments, submissions, grades, modules, pages, calendar/planner, announcements, discussions, files, messages, notifications, profile, quizzes, rubrics.\n" +
  "Disabled in this student profile: instructor/admin authoring and grading flows (course/assignment/page/module creation or deletion, quiz/rubric authoring, admin user management).";

function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function normalizeToolOutput(
  toolResult: Awaited<ReturnType<ToolDef["handler"]>>,
) {
  const content = toolResult.content.map((entry) => ({
    type: "text" as const,
    text: entry.text,
  }));

  if (toolResult.isError) {
    const message = content[0]?.text || "Canvas tool execution failed";
    throw new Error(message);
  }

  const firstText = content[0]?.text;
  const structuredContent = firstText ? tryParseJson(firstText) : undefined;
  if (structuredContent !== undefined) {
    return { content, structuredContent };
  }

  return { content };
}

function registerCanvasTool(
  server: McpServer,
  client: CanvasClient,
  tool: ToolDef,
) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
    async (args: unknown) => {
      const result = await tool.handler(args as never, { canvas: client });
      return normalizeToolOutput(result) as any;
    },
  );
}

export function createCanvasMcpServer(client: CanvasClient) {
  const server = new McpServer({
    name: "oghmanotes-canvas",
    version: "2.0.0",
  });

  for (const tool of canvasMcpStudentTools) {
    registerCanvasTool(server, client, tool);
  }

  return server;
}
