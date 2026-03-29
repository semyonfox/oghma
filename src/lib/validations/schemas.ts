import { z, ZodType } from "zod";
import { NextResponse } from "next/server";

// ── shared schemas ──────────────────────────────────────────────────────────

export const uuidParam = z.string().uuid();

export const noteCreateSchema = z.object({
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
});

export const quizSessionCreateSchema = z.object({
  filterType: z.enum([
    "course",
    "module",
    "note",
    "search",
    "chat_session",
    "all",
  ]),
  filterValue: z.unknown().optional(),
  maxQuestions: z.coerce.number().int().min(1).max(100).optional(),
});

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
    return {
      success: false,
      response: NextResponse.json(
        {
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 },
      ),
    };
  }
  return { success: true, data: result.data };
}

export function validateParams<T>(
  schema: ZodType<T>,
  data: unknown,
): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: "Invalid parameters",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 },
      ),
    };
  }
  return { success: true, data: result.data };
}
