import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CanvasClient } from "@/lib/canvas/client.js";

const MAX_RETURNED_ITEMS = 25;
const MAX_TEXT_LENGTH = 500;

function trimText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, MAX_TEXT_LENGTH);
}

function clampItems<T>(items: T[], limit = MAX_RETURNED_ITEMS): T[] {
  return items.slice(0, limit);
}

export function createCanvasMcpServer(client: CanvasClient) {
  const server = new McpServer({
    name: "oghmanotes-canvas",
    version: "1.0.0",
  });

  server.registerTool(
    "canvas_list_courses",
    {
      description:
        "List the user's active Canvas courses. Read-only. Use first when you need a course ID.",
      inputSchema: {
        limit: z.number().int().min(1).max(MAX_RETURNED_ITEMS).optional(),
      },
      outputSchema: {
        courses: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            courseCode: z.string(),
            term: z.string(),
          }),
        ),
      },
    },
    async ({ limit }) => {
      const { data, error } = await client.getCourses();
      if (error) {
        throw new Error(error);
      }

      const courses = clampItems(data ?? [], limit).map((course) => ({
        id: String(course.id),
        name: trimText(course.name, String(course.id)),
        courseCode: trimText(course.course_code),
        term: trimText(course?.term?.name),
      }));

      return {
        content: [{ type: "text", text: JSON.stringify({ courses }, null, 2) }],
        structuredContent: { courses },
      };
    },
  );

  server.registerTool(
    "canvas_list_modules",
    {
      description:
        "List modules in a Canvas course. Read-only. Use after selecting a course.",
      inputSchema: {
        courseId: z.string().min(1),
        limit: z.number().int().min(1).max(MAX_RETURNED_ITEMS).optional(),
      },
      outputSchema: {
        modules: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            itemCount: z.number().int().nonnegative(),
            unlockAt: z.string().nullable(),
          }),
        ),
      },
    },
    async ({ courseId, limit }) => {
      const { data, error } = await client.getModules(courseId);
      if (error) {
        throw new Error(error);
      }

      const modules = clampItems(data ?? [], limit).map((module) => ({
        id: String(module.id),
        name: trimText(module.name, String(module.id)),
        itemCount: Number(module.items_count ?? 0),
        unlockAt:
          typeof module.unlock_at === "string" ? module.unlock_at : null,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify({ modules }, null, 2) }],
        structuredContent: { modules },
      };
    },
  );

  server.registerTool(
    "canvas_list_assignments",
    {
      description:
        "List assignments in a Canvas course. Read-only. Includes due dates and submission status when available.",
      inputSchema: {
        courseId: z.string().min(1),
        limit: z.number().int().min(1).max(MAX_RETURNED_ITEMS).optional(),
      },
      outputSchema: {
        assignments: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            dueAt: z.string().nullable(),
            htmlUrl: z.string().nullable(),
            submissionState: z.string().nullable(),
          }),
        ),
      },
    },
    async ({ courseId, limit }) => {
      const { data, error } = await client.getAssignments(courseId);
      if (error) {
        throw new Error(error);
      }

      const assignments = clampItems(data ?? [], limit).map((assignment) => ({
        id: String(assignment.id),
        name: trimText(assignment.name, String(assignment.id)),
        dueAt:
          typeof assignment.due_at === "string" ? assignment.due_at : null,
        htmlUrl:
          typeof assignment.html_url === "string"
            ? assignment.html_url
            : null,
        submissionState:
          typeof assignment?.submission?.workflow_state === "string"
            ? assignment.submission.workflow_state
            : null,
      }));

      return {
        content: [
          { type: "text", text: JSON.stringify({ assignments }, null, 2) },
        ],
        structuredContent: { assignments },
      };
    },
  );

  server.registerTool(
    "canvas_list_module_items",
    {
      description:
        "List items inside a Canvas module. Read-only. Helpful for finding files, pages, and assignments inside a module.",
      inputSchema: {
        courseId: z.string().min(1),
        moduleId: z.string().min(1),
        limit: z.number().int().min(1).max(MAX_RETURNED_ITEMS).optional(),
      },
      outputSchema: {
        items: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            type: z.string(),
            contentId: z.string().nullable(),
            htmlUrl: z.string().nullable(),
          }),
        ),
      },
    },
    async ({ courseId, moduleId, limit }) => {
      const { data, error } = await client.getModuleItems(courseId, moduleId);
      if (error) {
        throw new Error(error);
      }

      const items = clampItems(data ?? [], limit).map((item) => ({
        id: String(item.id),
        title: trimText(item.title, String(item.id)),
        type: trimText(item.type, "unknown"),
        contentId:
          item.content_id === null || item.content_id === undefined
            ? null
            : String(item.content_id),
        htmlUrl:
          typeof item.html_url === "string" ? item.html_url.slice(0, 1000) : null,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify({ items }, null, 2) }],
        structuredContent: { items },
      };
    },
  );

  server.registerTool(
    "canvas_get_file",
    {
      description:
        "Get metadata for one Canvas file by course ID and file ID. Read-only. Returns filename, content type, and download URL metadata only.",
      inputSchema: {
        courseId: z.string().min(1),
        fileId: z.string().min(1),
      },
      outputSchema: {
        file: z.object({
          id: z.string(),
          displayName: z.string(),
          contentType: z.string().nullable(),
          size: z.number().int().nonnegative().nullable(),
          url: z.string().nullable(),
          updatedAt: z.string().nullable(),
        }),
      },
    },
    async ({ courseId, fileId }) => {
      const { data, error } = await client.getFile(courseId, fileId);
      if (error) {
        throw new Error(error);
      }
      if (!data) {
        throw new Error("File not found");
      }

      const file = {
        id: String(data.id),
        displayName: trimText(data.display_name, String(data.id)),
        contentType:
          typeof data["content-type"] === "string"
            ? data["content-type"]
            : null,
        size: Number.isFinite(data.size) ? Number(data.size) : null,
        url: typeof data.url === "string" ? data.url.slice(0, 1000) : null,
        updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
      };

      return {
        content: [{ type: "text", text: JSON.stringify({ file }, null, 2) }],
        structuredContent: { file },
      };
    },
  );

  return server;
}

export const canvasMcpToolSchemas = {
  canvas_list_courses: {
    inputSchema: z.object({
      limit: z.number().int().min(1).max(MAX_RETURNED_ITEMS).optional(),
    }),
    outputSchema: z.object({
      courses: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          courseCode: z.string(),
          term: z.string(),
        }),
      ),
    }),
  },
  canvas_list_modules: {
    inputSchema: z.object({
      courseId: z.string().min(1),
      limit: z.number().int().min(1).max(MAX_RETURNED_ITEMS).optional(),
    }),
    outputSchema: z.object({
      modules: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          itemCount: z.number().int().nonnegative(),
          unlockAt: z.string().nullable(),
        }),
      ),
    }),
  },
  canvas_list_assignments: {
    inputSchema: z.object({
      courseId: z.string().min(1),
      limit: z.number().int().min(1).max(MAX_RETURNED_ITEMS).optional(),
    }),
    outputSchema: z.object({
      assignments: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          dueAt: z.string().nullable(),
          htmlUrl: z.string().nullable(),
          submissionState: z.string().nullable(),
        }),
      ),
    }),
  },
  canvas_list_module_items: {
    inputSchema: z.object({
      courseId: z.string().min(1),
      moduleId: z.string().min(1),
      limit: z.number().int().min(1).max(MAX_RETURNED_ITEMS).optional(),
    }),
    outputSchema: z.object({
      items: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          type: z.string(),
          contentId: z.string().nullable(),
          htmlUrl: z.string().nullable(),
        }),
      ),
    }),
  },
  canvas_get_file: {
    inputSchema: z.object({
      courseId: z.string().min(1),
      fileId: z.string().min(1),
    }),
    outputSchema: z.object({
      file: z.object({
        id: z.string(),
        displayName: z.string(),
        contentType: z.string().nullable(),
        size: z.number().int().nonnegative().nullable(),
        url: z.string().nullable(),
        updatedAt: z.string().nullable(),
      }),
    }),
  },
} as const;
