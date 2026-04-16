// tool definitions, parent folder hints, and LLM call options assembly

import { tool, stepCountIs } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import sql from "@/database/pgsql.js";
import { generateUUID } from "@/lib/utils/uuid";
import {
  addNoteToTree,
  moveNoteInTree,
} from "@/lib/notes/storage/pg-tree.js";
import { getStorageProvider } from "@/lib/storage/init";
import { chunkText } from "@/lib/chunking";
import { replaceNoteEmbeddings } from "@/lib/rag/indexing";
import { processExtractedText } from "@/lib/canvas/text-processing.js";
import { cacheInvalidate, cacheKeys } from "@/lib/cache";
import { resolveAppOrigin } from "@/lib/chat/canvas-mcp-client";
import { getOptionalCanvasTooling } from "@/lib/chat/canvas-tooling";
import { searchChatChunks } from "@/lib/chat/chunk-search";
import {
  type ChatMessage,
  type ChatSessionContext,
  type ChatSessionContextItem,
  recordSessionAccesses,
  recordSessionCreatedNote,
} from "@/lib/chat/session";
import {
  buildThinkingOptions,
  createLlmProvider,
  getLlmMaxTokens,
  getLlmModel,
  type LlmThinkingMode,
} from "@/lib/ai-config";
import type { MoonshotAILanguageModelOptions } from "@ai-sdk/moonshotai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { MCPClient } from "@ai-sdk/mcp";

function inferNoteTitle(content: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 120);
  const firstLine = content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (firstLine) return firstLine.slice(0, 120);
  return "AI Note";
}

function sanitizeFileName(raw: string): string {
  return raw
    .replace(/^\.+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .substring(0, 255);
}

export interface BuildLlmCallParams {
  userId: string;
  sessionId: string;
  sessionContext: ChatSessionContext;
  scopedNoteIds: string[] | null;
  scopedInputNoteIds: string[];
  history: ChatMessage[];
  message: string;
  systemPrompt: string;
  sessionMemoryPrompt: string;
  thinkingMode: LlmThinkingMode;
  requestOrigin: string;
  referer: string | null;
}

export interface LlmCallResult {
  model: LanguageModelV3 | null;
  llmAvailable: boolean;
  llmCallOptions: {
    messages: ChatMessage[];
    maxOutputTokens: number;
    temperature?: number;
    stopWhen: ReturnType<typeof stepCountIs>;
    tools: ToolSet;
    providerOptions: { moonshotai: MoonshotAILanguageModelOptions };
  };
  canvasMcpClient: MCPClient | null;
}

async function resolveParentFolderHint(
  userId: string,
  scopedInputNoteIds: string[],
  sessionContext: ChatSessionContext,
): Promise<string> {
  if (scopedInputNoteIds.length > 0) {
    const parentRows = await sql`
      SELECT DISTINCT ti.parent_id, n.note_id, n.title
      FROM app.tree_items ti
      JOIN app.notes n ON n.note_id = ti.parent_id::uuid
      WHERE ti.note_id = ANY(${scopedInputNoteIds}::uuid[])
        AND ti.parent_id IS NOT NULL
        AND n.is_folder = true
        AND n.deleted_at IS NULL
        AND n.user_id = ${userId}::uuid
      LIMIT 5
    `;
    if ((parentRows as any[]).length > 0) {
      const hints = (parentRows as { note_id: string; title: string }[])
        .map((r) => `"${r.title}" (id: ${r.note_id})`)
        .join(", ");
      return (
        `\nThe current note's parent folder(s): ${hints}. ` +
        "Use the most relevant folder's id as parentID when creating a note — no need to call findFolder."
      );
    }
  }
  if (sessionContext.lastFolder) {
    return (
      `\nLast folder used for note creation: "${sessionContext.lastFolder.title}" ` +
      `(id: ${sessionContext.lastFolder.id}). Use that parentID directly when it fits.`
    );
  }
  return "";
}

function buildToolInstruction(
  scopedParentHint: string,
  canvasInstruction: string,
): string {
  return (
    "Tools available:\n" +
    "- getChunks({ query, mode?, scope? }) — search notes for relevant chunks. mode: 'semantic' (default, conceptual match), 'exact' (literal phrase/term), 'both'. scope: 'session' (default, stay in current scope) or 'all' (search across all notes). Returns chunk text + noteId per hit.\n" +
    "- readNote({ noteId }) — read the full markdown content of a note. Use after getChunks confirms the right note.\n" +
    "- findFolder({ query }) — search for a folder/course directory by name. Use when parent folder is not already known.\n" +
    "- makeMDNote({ text, parentID?, title? }) — create a markdown note. Set parentID to place it in the right folder.\n" +
    "- moveNote({ noteId, targetFolderId }) — move a note or folder into a different parent folder. Use findFolder first if needed.\n" +
    "- renameNote({ noteId, newTitle }) — rename a note or folder.\n" +
    "- addTimeBlock({ title, startsAt, endsAt, assignmentId? }) — create a study time block on the calendar. Times are ISO 8601.\n" +
    "- completeTimeBlock({ blockId }) — mark a time block as completed.\n" +
    "When the user asks to create/save/write a note: if you already know the parentID (from context below), call makeMDNote directly. Otherwise call findFolder first. Prefer session scope first. Only use scope='all' when the user asks to search beyond the current scope or when scoped search clearly isn't enough." +
    scopedParentHint +
    (canvasInstruction ? `\n\n${canvasInstruction}` : "")
  );
}

function createChatTools(
  userId: string,
  sessionId: string,
  scopedNoteIds: string[] | null,
  canvasTools: ToolSet,
): { tools: ToolSet } {
  const makeMDNote = tool({
    description:
      "Create a markdown note for the current user. Use parentID to place it under a folder.",
    inputSchema: z.object({
      text: z.string().min(1).max(200_000),
      parentID: z.string().uuid().nullable().optional(),
      title: z.string().min(1).max(500).optional(),
    }),
    execute: async ({ text, parentID, title }) => {
      const trimmed = text.trim();
      if (!trimmed) throw new Error("text cannot be empty");

      let parentFolder: ChatSessionContextItem | null = null;
      if (parentID) {
        const parentRows = await sql`
          SELECT note_id, title, is_folder
          FROM app.notes
          WHERE note_id = ${parentID}::uuid
            AND user_id = ${userId}::uuid
            AND deleted_at IS NULL
          LIMIT 1
        `;
        if (!parentRows[0])
          throw new Error("parentID does not exist for this user");
        if (!parentRows[0].is_folder)
          throw new Error("parentID must reference a folder");
        parentFolder = {
          id: parentID,
          title: parentRows[0].title || "Folder",
        };
      }

      const resolvedTitle = (
        title?.trim() || inferNoteTitle(trimmed)
      ).slice(0, 500);
      const markdown =
        trimmed.startsWith("#") || trimmed.startsWith("---")
          ? trimmed
          : `# ${resolvedTitle}\n\n${trimmed}`;
      const fileName = sanitizeFileName(
        `${resolvedTitle || "AI_Note"}.md`,
      );
      const markdownBuffer = Buffer.from(markdown, "utf-8");

      const newNoteId = generateUUID();
      const storagePath = `notes/${newNoteId}/${fileName}`;
      const extractedText = processExtractedText(markdown);

      const storage = getStorageProvider();
      await storage.putObject(storagePath, markdownBuffer, {
        contentType: "text/markdown",
      });

      await sql`
        INSERT INTO app.notes (note_id, user_id, title, content, is_folder, created_at, updated_at)
        VALUES (${newNoteId}::uuid, ${userId}::uuid, ${resolvedTitle}, ${markdown}, false, NOW(), NOW())
      `;
      await addNoteToTree(userId, newNoteId, parentID || null);
      const attachmentId = generateUUID();
      await sql`
        INSERT INTO app.attachments (id, note_id, user_id, filename, s3_key, mime_type, file_size)
        VALUES (
          ${attachmentId}::uuid,
          ${newNoteId}::uuid,
          ${userId}::uuid,
          ${fileName},
          ${storagePath},
          ${"text/markdown"},
          ${markdownBuffer.length}
        )
      `;
      await sql`
        UPDATE app.notes
        SET s3_key = ${storagePath}, extracted_text = ${extractedText}, updated_at = NOW()
        WHERE note_id = ${newNoteId}::uuid AND user_id = ${userId}::uuid
      `;

      await replaceNoteEmbeddings(
        newNoteId,
        userId,
        chunkText(markdown),
      );

      await cacheInvalidate(
        cacheKeys.treeChildren(userId, parentID || null),
        cacheKeys.treeFull(userId),
        cacheKeys.notesList(userId, 0, undefined),
        cacheKeys.note(userId, newNoteId),
      );

      await recordSessionCreatedNote(
        sessionId,
        { id: newNoteId, title: resolvedTitle },
        parentFolder,
      );

      return {
        noteId: newNoteId,
        attachmentId,
        title: resolvedTitle,
        parentID: parentID || null,
        s3Key: storagePath,
        noteUrl: `/notes/${newNoteId}`,
      };
    },
  });

  const findFolder = tool({
    description:
      "Search for a folder in the user's notes by name or course keyword. " +
      "Returns matching folders with their IDs. Use this to find parentID before creating a note.",
    inputSchema: z.object({
      query: z.string().min(1).max(200),
    }),
    execute: async ({ query }) => {
      const rows = await sql`
        SELECT note_id, title
        FROM app.notes
        WHERE user_id = ${userId}::uuid
          AND is_folder = true
          AND deleted_at IS NULL
          AND title ILIKE ${"%" + query.replace(/%/g, "\\%").replace(/_/g, "\\_") + "%"}
        ORDER BY title ASC
        LIMIT 10
      `;
      return {
        folders: (rows as { note_id: string; title: string }[]).map(
          (r) => ({
            id: r.note_id,
            title: r.title,
          }),
        ),
      };
    },
  });

  const getChunks = tool({
    description:
      "Search the user's notes for relevant chunks. " +
      "Use mode='semantic' (default) for conceptual/topic queries. " +
      "Use mode='exact' when looking for a specific term, name, formula, or phrase the user likely wrote verbatim. " +
      "Use mode='both' to run both and merge results. " +
      "Use scope='session' to stay inside the current chat context, or scope='all' to search the full note library when needed. " +
      "Returns matching chunks with their noteId and title — call readNote if you need the full note.",
    inputSchema: z.object({
      query: z.string().min(1).max(300),
      mode: z.enum(["semantic", "exact", "both"]).default("semantic"),
      scope: z.enum(["session", "all"]).default("session"),
    }),
    execute: async ({ query, mode, scope }) => {
      const results = await searchChatChunks({
        userId,
        query,
        mode,
        scopedNoteIds: scope === "all" ? null : scopedNoteIds,
      });

      await recordSessionAccesses(
        sessionId,
        [
          ...new Map(
            results.map((result) => [
              result.noteId,
              {
                id: result.noteId,
                title: result.title || "Untitled",
                kind: "search-hit" as const,
              },
            ]),
          ).values(),
        ].slice(0, 6),
      );

      return { results };
    },
  });

  const readNote = tool({
    description:
      "Read the full content of a note by ID. Use this once getChunks has identified the right note " +
      "and you need the complete text. Returns the raw markdown content.",
    inputSchema: z.object({
      noteId: z.string().uuid(),
    }),
    execute: async ({ noteId: readNoteId }) => {
      const [row] = await sql`
        SELECT title, content, extracted_text
        FROM app.notes
        WHERE note_id = ${readNoteId}::uuid
          AND user_id = ${userId}::uuid
          AND is_folder = false
          AND deleted_at IS NULL
      `;
      if (!row) return { error: "Note not found" };

      await recordSessionAccesses(sessionId, [
        {
          id: readNoteId,
          title: row.title || "Untitled",
          kind: "read",
        },
      ]);

      return {
        noteId: readNoteId,
        title: row.title,
        content: (row.content || row.extracted_text || "").slice(0, 20_000),
      };
    },
  });

  const moveNote = tool({
    description:
      "Move a note or folder into a different parent folder. " +
      "Use findFolder first if you don't already know the targetFolderId.",
    inputSchema: z.object({
      noteId: z.string().uuid(),
      targetFolderId: z.string().uuid(),
    }),
    execute: async ({ noteId: moveNoteId, targetFolderId }) => {
      const [note] = await sql`
        SELECT note_id, title FROM app.notes
        WHERE note_id = ${moveNoteId}::uuid
          AND user_id = ${userId}::uuid
          AND deleted_at IS NULL
      `;
      if (!note) throw new Error("Note not found");

      const [folder] = await sql`
        SELECT note_id, title, is_folder FROM app.notes
        WHERE note_id = ${targetFolderId}::uuid
          AND user_id = ${userId}::uuid
          AND deleted_at IS NULL
      `;
      if (!folder) throw new Error("Target folder not found");
      if (!folder.is_folder) throw new Error("Target must be a folder");

      // get old parent for cache invalidation
      const [treeItem] = await sql`
        SELECT parent_id FROM app.tree_items
        WHERE note_id = ${moveNoteId}::uuid AND user_id = ${userId}::uuid
      `;
      const oldParentId = treeItem?.parent_id || null;

      await moveNoteInTree(userId, moveNoteId, targetFolderId);

      await cacheInvalidate(
        cacheKeys.treeChildren(userId, oldParentId),
        cacheKeys.treeChildren(userId, targetFolderId),
        cacheKeys.treeFull(userId),
      );

      return {
        noteId: moveNoteId,
        newParentId: targetFolderId,
        folderTitle: folder.title,
      };
    },
  });

  const renameNote = tool({
    description:
      "Rename a note or folder. Changes the title displayed in the tree.",
    inputSchema: z.object({
      noteId: z.string().uuid(),
      newTitle: z.string().min(1).max(500),
    }),
    execute: async ({ noteId: renameNoteId, newTitle }) => {
      const [note] = await sql`
        SELECT note_id, title FROM app.notes
        WHERE note_id = ${renameNoteId}::uuid
          AND user_id = ${userId}::uuid
          AND deleted_at IS NULL
      `;
      if (!note) throw new Error("Note not found");

      const oldTitle = note.title;
      await sql`
        UPDATE app.notes
        SET title = ${newTitle.trim()}, updated_at = NOW()
        WHERE note_id = ${renameNoteId}::uuid AND user_id = ${userId}::uuid
      `;

      await cacheInvalidate(
        cacheKeys.treeFull(userId),
        cacheKeys.note(userId, renameNoteId),
        cacheKeys.notesList(userId, 0, undefined),
      );

      return { noteId: renameNoteId, oldTitle, newTitle: newTitle.trim() };
    },
  });

  const addTimeBlock = tool({
    description:
      "Create a study time block on the calendar. Optionally link it to an assignment. " +
      "Times must be ISO 8601 strings (e.g. '2026-04-17T15:00:00Z').",
    inputSchema: z.object({
      title: z.string().min(1).max(200),
      startsAt: z.string(),
      endsAt: z.string(),
      assignmentId: z.string().uuid().optional(),
    }),
    execute: async ({ title: blockTitle, startsAt, endsAt, assignmentId }) => {
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      const durationMins = (end.getTime() - start.getTime()) / 60000;
      if (durationMins <= 0) throw new Error("End must be after start");

      if (assignmentId) {
        const [owned] = await sql`
          SELECT 1 FROM app.assignments
          WHERE id = ${assignmentId}::uuid AND user_id = ${userId}::uuid
        `;
        if (!owned) throw new Error("Assignment not found");
      }

      const pomodoroCount = Math.max(1, Math.ceil(durationMins / 30));

      const [row] = await sql`
        INSERT INTO app.time_blocks (
          user_id, assignment_id, title, starts_at, ends_at, pomodoro_count
        ) VALUES (
          ${userId}::uuid, ${assignmentId ?? null},
          ${blockTitle}, ${startsAt}, ${endsAt}, ${pomodoroCount}
        )
        RETURNING id, title, starts_at, ends_at, pomodoro_count
      `;

      return {
        blockId: row.id,
        title: row.title,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        pomodoroCount: row.pomodoro_count,
      };
    },
  });

  const completeTimeBlock = tool({
    description: "Mark a time block as completed.",
    inputSchema: z.object({
      blockId: z.string().uuid(),
    }),
    execute: async ({ blockId }) => {
      const [row] = await sql`
        UPDATE app.time_blocks
        SET completed = true
        WHERE id = ${blockId}::uuid AND user_id = ${userId}::uuid
        RETURNING id, completed
      `;
      if (!row) throw new Error("Time block not found");

      return { blockId: row.id, completed: true };
    },
  });

  return {
    tools: {
      getChunks,
      readNote,
      findFolder,
      makeMDNote,
      moveNote,
      renameNote,
      addTimeBlock,
      completeTimeBlock,
      ...canvasTools,
    },
  };
}

export async function buildLlmCall(
  params: BuildLlmCallParams,
): Promise<LlmCallResult> {
  const scopedParentHint = await resolveParentFolderHint(
    params.userId,
    params.scopedInputNoteIds,
    params.sessionContext,
  );

  const appOrigin = resolveAppOrigin({
    requestOrigin: params.requestOrigin,
    referer: params.referer,
  });
  const {
    client: canvasMcpClient,
    tools: canvasTools,
    instruction: canvasInstruction,
  } = await getOptionalCanvasTooling({
    userId: params.userId,
    appOrigin,
  });

  const toolInstruction = buildToolInstruction(
    scopedParentHint,
    canvasInstruction,
  );

  const { tools } = createChatTools(
    params.userId,
    params.sessionId,
    params.scopedNoteIds,
    canvasTools,
  );

  const chatMessages: ChatMessage[] = [
    {
      role: "system",
      content: [params.systemPrompt, params.sessionMemoryPrompt, toolInstruction]
        .filter(Boolean)
        .join("\n\n"),
    },
    ...params.history.slice(-20),
    { role: "user", content: params.message },
  ];

  const provider = createLlmProvider();
  const model = provider ? provider(getLlmModel()) : null;

  const thinkingOptions = buildThinkingOptions(params.thinkingMode);
  const moonshotOptions: MoonshotAILanguageModelOptions = {
    thinking: thinkingOptions,
  };

  return {
    model,
    llmAvailable: !!model,
    llmCallOptions: {
      messages: chatMessages,
      maxOutputTokens: getLlmMaxTokens(),
      ...(params.thinkingMode !== "off" && { temperature: 1 }),
      stopWhen: stepCountIs(50),
      tools,
      providerOptions: { moonshotai: moonshotOptions },
    },
    canvasMcpClient,
  };
}
