import { z, ZodType } from "zod";
import { NextResponse } from "next/server";
import { generateTraceId, getTraceId } from "@/lib/trace";
import { canvasIdForBigintColumn } from "@/lib/canvas/id.js";

// ── shared schemas ──────────────────────────────────────────────────────────

export const uuidParam = z.string().uuid();

export const noteCreateSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().max(500).optional(),
  content: z.string().optional(),
  isFolder: z.boolean().optional(),
  is_folder: z.boolean().optional(),
  pid: z.string().uuid().nullish(),
});

export const noteUpdateSchema = z
  .object({
    title: z.string().max(500).optional(),
    content: z.string().optional(),
  })
  .refine((data) => data.title !== undefined || data.content !== undefined, {
    message: "At least one of title or content is required",
  });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200).trim(),
});

export const loginSchema = z.object({
  email: z.string().email().max(255).trim(),
  password: z.string().min(1, "Password is required").max(128),
  rememberMe: z.boolean().optional(),
});

export const registerSchema = z.object({
  email: z.string().email().max(255).trim(),
  password: z.string().min(8).max(128),
  agentClaimToken: z.string().length(64).optional(),
  agentUserCode: z.string().regex(/^\d{6}$/).optional(),
}).refine(
  (data) => Boolean(data.agentClaimToken) === Boolean(data.agentUserCode),
  { message: "Agent registration claims require both a token and a six-digit code" },
);

export const agentRegistrationSchema = z.object({
  type: z.literal("service_auth"),
  login_hint: z.string().email().max(255).trim(),
});

export const agentRegistrationClaimSchema = z.object({
  claim_token: z.string().length(64),
});

export const agentRegistrationCompleteSchema = z.object({
  claim_token: z.string().length(64),
  user_code: z.string().regex(/^\d{6}$/),
});

const quizMaxQuestions = z.coerce.number().int().min(1).max(100).optional();
const canvasBigintId = z
  .union([z.string(), z.number()])
  .transform((value, context) => {
    try {
      return canvasIdForBigintColumn(value, "Canvas ID");
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid Canvas ID",
      });
      return z.NEVER;
    }
  });

export const quizSessionCreateSchema = z.discriminatedUnion("filterType", [
  z
    .object({
      filterType: z.literal("course"),
      filterValue: canvasBigintId,
      maxQuestions: quizMaxQuestions,
    })
    .strict(),
  z
    .object({
      filterType: z.literal("module"),
      filterValue: canvasBigintId,
      maxQuestions: quizMaxQuestions,
    })
    .strict(),
  z
    .object({
      filterType: z.literal("note"),
      filterValue: z.array(z.string().uuid()).min(1),
      maxQuestions: quizMaxQuestions,
    })
    .strict(),
  z
    .object({
      filterType: z.literal("search"),
      filterValue: z.string().trim().min(2).max(2000),
      maxQuestions: quizMaxQuestions,
    })
    .strict(),
  z
    .object({
      filterType: z.literal("chat_session"),
      filterValue: z.string().uuid(),
      maxQuestions: quizMaxQuestions,
    })
    .strict(),
  z
    .object({
      filterType: z.literal("all"),
      maxQuestions: quizMaxQuestions,
    })
    .strict(),
]);

const isoDateTime = z.string().datetime({ offset: true });

const nullableText = z.string().max(500).nullable();

export const assignmentCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().max(10000).nullable().optional(),
    course_name: nullableText.optional(),
    course_color: nullableText.optional(),
    due_at: isoDateTime.nullable().optional(),
    estimated_hours: z.number().finite().min(0).nullable().optional(),
  })
  .strict();

export const assignmentUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().max(10000).nullable().optional(),
    status: z.enum(["upcoming", "in_progress", "done", "late"]).optional(),
    estimated_hours: z.number().finite().min(0).nullable().optional(),
    course_color: nullableText.optional(),
    due_at: isoDateTime.nullable().optional(),
    course_name: nullableText.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const timeBlockCreateSchema = z
  .object({
    assignment_id: z.string().uuid().nullable().optional(),
    title: z.string().max(500).nullable().optional(),
    starts_at: isoDateTime,
    ends_at: isoDateTime,
  })
  .strict()
  .refine((data) => Date.parse(data.ends_at) > Date.parse(data.starts_at), {
    message: "ends_at must be after starts_at",
    path: ["ends_at"],
  });

export const timeBlockRangeSchema = z
  .object({
    start: isoDateTime,
    end: isoDateTime,
  })
  .refine((data) => Date.parse(data.end) > Date.parse(data.start), {
    message: "end must be after start",
    path: ["end"],
  });

export const timeBlockUpdateSchema = z
  .object({
    assignment_id: z.string().uuid().nullable().optional(),
    title: z.string().max(500).nullable().optional(),
    starts_at: isoDateTime.optional(),
    ends_at: isoDateTime.optional(),
    completed: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  })
  .refine(
    (data) =>
      !data.starts_at ||
      !data.ends_at ||
      Date.parse(data.ends_at) > Date.parse(data.starts_at),
    { message: "ends_at must be after starts_at", path: ["ends_at"] },
  );

const chatScopeItemSchema = z.object({
  id: z.string(),
  title: z.string(),
}).strict();

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  noteId: z.string().optional(),
  noteTitle: z.string().optional(),
  noteIds: z.array(z.string()).optional(),
  folderIds: z.array(z.string()).optional(),
  selectedNotes: z.array(chatScopeItemSchema).optional(),
  selectedFolders: z.array(chatScopeItemSchema).optional(),
  // The browser sends `null` until the first session has been created.
  sessionId: z.string().nullable().optional(),
  history: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
  }).strict()).optional(),
  stream: z.boolean().optional(),
  background: z.boolean().optional(),
  thinkingMode: z.enum(["off", "auto"]).optional(),
  useRag: z.boolean().optional(),
  clientDateTime: z.string().optional(),
}).strict();

// ── validation helpers ──────────────────────────────────────────────────────

type ValidationSuccess<T> = { success: true; data: T };
type ValidationFailure = { success: false; response: NextResponse };
type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export function validateBody<T>(
  schema: ZodType<T>,
  data: unknown,
): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.flatten().fieldErrors;
    const currentTraceId = getTraceId();
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details,
          validationErrors: details,
          traceId:
            currentTraceId === "no-trace" ? generateTraceId() : currentTraceId,
        },
        { status: 400 },
      ),
    };
  }
  return { success: true, data: result.data };
}
