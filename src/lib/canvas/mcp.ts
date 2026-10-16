import { isReadOnlyCanvasTool } from "./tool-policy";
import type { CanvasCredentials } from "./credentials";
import { safeCanvasFetch } from "./safe-fetch";
import { proposeToolAction } from "@/lib/chat/actions";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZodTypeAny } from "zod";
import {
  CanvasClient,
  type FetchLike,
} from "@/lib/canvas-mcp/src/canvas/client";
import { allTools } from "@/lib/canvas-mcp/src/tools";
import {
  executeTool,
  type ToolDef,
} from "@/lib/canvas-mcp/src/tools/types";

// a typo here would silently leave the tool enabled, so the profile test
// checks every name against the registry
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

  // privileged file operations
  "canvas_delete_file",

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

export const canvasMcpToolSchemas: Record<string, { inputSchema: ZodTypeAny }> =
  Object.fromEntries(
    canvasMcpStudentTools.map((tool) => [
      tool.name,
      { inputSchema: tool.inputSchema },
    ]),
  );

export const canvasToolInstruction =
  "Canvas student tools are available for course data. Changes return a proposal that the user must review and approve before it runs.\n" +
  "Available categories: courses, assignments, submissions, grades, modules, pages, calendar/planner, announcements, discussions, files, messages, notifications, profile, quizzes, rubrics.\n" +
  "Disabled in this student profile: instructor/admin authoring and grading flows (course/assignment/page/module creation or deletion, quiz/rubric authoring, admin user management).";

/**
 * A Canvas client bound to one user's stored connection. Every request is
 * pinned to that user's Canvas origin and goes through the public-address
 * guard, so a tool argument or Canvas response cannot redirect the token.
 */
export function createUserCanvasClient(
  credentials: CanvasCredentials,
): CanvasClient {
  const origin = new URL(`https://${credentials.domain}`).origin;
  const guardedFetch: FetchLike = async (url, init) => {
    if (new URL(url).origin !== origin) {
      throw new Error("Canvas request points to another host");
    }
    if (init?.body != null && typeof init.body !== "string") {
      throw new Error("Canvas request body must be JSON");
    }
    return safeCanvasFetch(
      url,
      Object.fromEntries(new Headers(init?.headers).entries()),
      false,
      {
        method: init?.method,
        body: init?.body ?? undefined,
        signal: init?.signal ?? undefined,
      },
    );
  };
  return new CanvasClient({ ...credentials, fetch: guardedFetch });
}

function asStructuredContent(
  text: string | undefined,
): Record<string, unknown> | undefined {
  if (!text) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeToolOutput(
  toolResult: Awaited<ReturnType<ToolDef["handler"]>>,
): CallToolResult {
  const content = toolResult.content.map((entry) => ({
    type: "text" as const,
    text: entry.text,
  }));

  if (toolResult.isError) {
    throw new Error(content[0]?.text || "Canvas tool execution failed");
  }

  const structuredContent = asStructuredContent(content[0]?.text);
  return structuredContent ? { content, structuredContent } : { content };
}

function registerCanvasTool(
  server: McpServer,
  client: CanvasClient,
  tool: ToolDef,
  userId: string,
) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
    async (args: unknown) => {
      const parsed = tool.inputSchema.parse(args);
      // the chat client already turns writes into proposals. this second
      // gate covers any other caller of the endpoint
      if (!isReadOnlyCanvasTool(tool.name)) {
        const proposal = await proposeToolAction(
          userId,
          null,
          tool.name,
          parsed,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(proposal) }],
          structuredContent: proposal,
        };
      }
      const result = await executeTool(tool, parsed, { canvas: client });
      return normalizeToolOutput(result);
    },
  );
}

export function createCanvasMcpServer(client: CanvasClient, userId: string) {
  const server = new McpServer({
    name: "oghmanotes-canvas",
    version: "2.0.0",
  });

  for (const tool of canvasMcpStudentTools) {
    registerCanvasTool(server, client, tool, userId);
  }

  return server;
}
