import { BLOOM_NAMES, BLOOM_DESCRIPTIONS } from "./types";
import type {
  BloomLevel,
  QuestionType,
  QuizOption,
  QuizQuestion,
} from "./types";
import { stripQuizArtifacts } from "./normalize-question";
import { generateUUID } from "@/lib/utils/uuid";
import {
  buildReasoningOptions,
  createLlmProvider,
  getLlmMaxTokens,
  getLlmModel,
  getLlmReasoningEffort,
  getLlmThinkingMode,
} from "@/lib/ai-config";
import { generateText } from "ai";
import { z } from "zod";
import type postgres from "postgres";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";

const MAX_CHUNK_CHARS = 4000;

type TrueFalseTarget = "true" | "false";

function pickTrueFalseTarget(): TrueFalseTarget {
  return Math.random() < 0.5 ? "true" : "false";
}

export function buildGenerationPrompt(
  chunkText: string,
  moduleName: string,
  bloomLevel: BloomLevel,
  questionType: QuestionType,
  existingQuestions?: string[],
  trueFalseTarget?: TrueFalseTarget,
): string {
  const levelName = BLOOM_NAMES[bloomLevel];
  const levelDesc = BLOOM_DESCRIPTIONS[bloomLevel];

  let typeInstruction = "";
  switch (questionType) {
    case "mcq":
      typeInstruction =
        "Generate a multiple choice question with exactly 4 options. Exactly one option must be correct.";
      break;
    case "true_false":
      const targetLabel =
        (trueFalseTarget ?? "false") === "true" ? "True" : "False";
      typeInstruction = `Generate a true/false question. The correct option MUST be ${targetLabel}. Set options to [{text: "True", is_correct: ...}, {text: "False", is_correct: ...}]. Ensure exactly one option is correct and that the correct_answer field matches ${targetLabel}.`;
      break;
    case "fill_in":
      typeInstruction =
        "Generate a fill-in-the-blank question. Set options to null. The correct_answer should be the expected word or short phrase.";
      break;
    default:
      typeInstruction = "Generate a multiple choice question with 4 options.";
  }

  return `You are generating a self-contained study question from university lecture notes.

The text below is source material extracted from a student's notes. Use it to write a question, but the student will NOT have access to these notes when answering — the question must work entirely on its own.

Source material:
---
${chunkText}
---

Module: ${moduleName}
Question type: ${questionType}
Target cognitive level: ${levelName} (Bloom's Taxonomy level ${bloomLevel})
${levelDesc}

${typeInstruction}

Rules:
- The question must be fully self-contained — include all context needed to answer it within the question text itself
- Never say "according to the notes", "from the provided content", "in your notes", or any phrase implying the student can see source material
- Only use facts from the source material above — do not introduce external information
- Do not go beyond this module's scope
- Match difficulty to the cognitive level
- The explanation should be educational and **subject-aware**. Study the content and module name to detect the domain, then format accordingly using markdown:
  - **Mathematics / Statistics / Physics / Engineering**: show step-by-step working using LaTeX ($inline$ or $$display block$$), state the underlying principle or theorem, give intuition for why it works
  - **Computer Science / Programming**: use fenced code blocks with a language tag where helpful, note algorithmic complexity or design trade-offs, explain the mechanism not just the syntax
  - **History / Politics / Law / Social Sciences**: give historical or legal context, explain causes and consequences, note the broader significance or lasting impact
  - **Natural Sciences (Biology, Chemistry, Medicine)**: explain the biological/chemical mechanism, give a real-world clinical, ecological, or industrial application
  - **Languages / Literature / Arts**: explain the technique, convention, or cultural context; connect to the broader work or tradition
  - **Any subject**: connect this concept to related ideas in the field, explain why it matters, give a concrete example if it aids understanding
  Format using markdown. Length: as long as it genuinely needs to be — typically 2–5 sentences for factual questions, more for multi-step proofs or derivations. Do not reference where the content came from.
- If the content is purely administrative or trivial — assignment credit weightings, submission deadlines, vocabulary lists, grading breakdowns, course logistics — and contains no learnable academic concept, return {"skip": true} instead

Return ONLY valid JSON. Either:
{
  "question_text": "...",
  "options": [{"text": "...", "is_correct": true/false}, ...] or null,
  "correct_answer": "...",
  "explanation": "..."
}
or if the content is not suitable:
{"skip": true}
${
  existingQuestions && existingQuestions.length > 0
    ? `
IMPORTANT: Avoid generating questions similar to these existing questions for this course:
${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}
Ask about a DIFFERENT concept or aspect of the material.`
    : ""
}`;
}

const nonBlankString = z
  .string()
  .refine((value) => value.trim().length > 0, "must not be blank");

const generatedQuestionSchema = z.object({
  question_text: nonBlankString,
  options: z
    .array(z.object({ text: nonBlankString, is_correct: z.boolean() }))
    .nullish()
    .transform((options) => options ?? null),
  correct_answer: nonBlankString,
  // a missing or malformed explanation is not worth dropping the question for
  explanation: z
    .string()
    .optional()
    .catch("")
    .transform((value) => value ?? ""),
});

type ParsedQuestion = z.infer<typeof generatedQuestionSchema>;

interface StoredQuestionRow {
  id: string;
  question_type: QuestionType;
  question_text: string;
  options: QuizOption[] | null;
  correct_answer: string;
  explanation: string | null;
}

export interface GenerateQuestionInput {
  userId: string;
  noteId: string;
  chunkId: string;
  chunkText: string;
  moduleName: string;
  bloomLevel: BloomLevel;
  questionType: QuestionType;
  courseId?: string;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
    const parsed: unknown = JSON.parse(jsonMatch[1]!.trim());
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function hasOneMatchingCorrectOption(
  options: QuizOption[],
  correctAnswer: string,
): boolean {
  const correctOptions = options.filter((option) => option.is_correct);
  return (
    correctOptions.length === 1 &&
    correctOptions[0].text.trim() === correctAnswer.trim()
  );
}

function hasUniqueOptionLabels(options: QuizOption[]): boolean {
  const labels = options.map((option) =>
    option.text.trim().toLocaleLowerCase("en"),
  );
  return new Set(labels).size === labels.length;
}

function optionsMatchQuestionType(
  options: QuizOption[] | null,
  correctAnswer: string,
  questionType: QuestionType,
): boolean {
  if (questionType === "fill_in") return options === null;
  if (!options || !hasOneMatchingCorrectOption(options, correctAnswer)) {
    return false;
  }

  if (questionType === "mcq") {
    return options.length === 4 && hasUniqueOptionLabels(options);
  }

  return (
    options.length === 2 &&
    options.map((option) => option.text.trim()).sort().join("|") ===
      "False|True"
  );
}

export function isSkipSignal(raw: string): boolean {
  return parseJsonObject(raw)?.skip === true;
}

export function parseGeneratedQuestion(
  raw: string,
  questionType: QuestionType,
): ParsedQuestion | null {
  const result = generatedQuestionSchema.safeParse(parseJsonObject(raw));
  if (!result.success) return null;

  const question = result.data;
  return optionsMatchQuestionType(
    question.options,
    question.correct_answer,
    questionType,
  )
    ? question
    : null;
}

async function callLLM(prompt: string): Promise<string> {
  const provider = createLlmProvider();
  if (!provider) throw new Error("LLM not configured");

  const thinkingMode = getLlmThinkingMode();
  const reasoning = buildReasoningOptions(
    thinkingMode,
    getLlmReasoningEffort(),
  );

  // the provider's fetch already enforces LLM_TIMEOUT_MS per attempt
  const { text } = await generateText({
    model: provider(getLlmModel()),
    prompt,
    maxOutputTokens: getLlmMaxTokens(),
    ...(thinkingMode !== "off" && { temperature: 1 }),
    maxRetries: 3,
    providerOptions: { openrouter: { reasoning } },
  });

  return text;
}

function toQuizQuestion(
  input: GenerateQuestionInput,
  row: StoredQuestionRow,
): QuizQuestion {
  return {
    id: row.id,
    user_id: input.userId,
    note_id: input.noteId,
    chunk_id: input.chunkId,
    question_type: row.question_type,
    bloom_level: input.bloomLevel,
    question_text: row.question_text,
    options: row.options,
    correct_answer: row.correct_answer,
    explanation: row.explanation ?? "",
  };
}

async function findStoredQuestion(
  tx: postgres.TransactionSql,
  { userId, chunkId, bloomLevel }: GenerateQuestionInput,
): Promise<StoredQuestionRow | null> {
  const [row] = await tx<StoredQuestionRow[]>`
    SELECT id, question_type, question_text, options, correct_answer, explanation
    FROM app.quiz_questions
    WHERE user_id = ${userId}::uuid
      AND chunk_id = ${chunkId}::uuid
      AND bloom_level = ${bloomLevel}
  `;
  return row ?? null;
}

/**
 * Every question needs exactly one card or it is never scheduled. Locking the
 * question row serialises concurrent generators so neither can add a second
 * card, and an older question left without a card gets one here.
 */
async function ensureCard(
  tx: postgres.TransactionSql,
  userId: string,
  questionId: string,
): Promise<void> {
  await tx`
    SELECT id FROM app.quiz_questions
    WHERE id = ${questionId}::uuid AND user_id = ${userId}::uuid
    FOR UPDATE
  `;
  await tx`
    INSERT INTO app.quiz_cards (id, user_id, question_id)
    SELECT ${generateUUID()}::uuid, ${userId}::uuid, ${questionId}::uuid
    WHERE NOT EXISTS (
      SELECT 1 FROM app.quiz_cards
      WHERE user_id = ${userId}::uuid AND question_id = ${questionId}::uuid
    )
  `;
}

/**
 * The question and its card are written together, and only while the source
 * chunk still belongs to a live note. A re-index or delete that lands during
 * the LLM call therefore leaves nothing behind, and a concurrent generator for
 * the same chunk and level reuses the winner's row.
 */
async function persistQuestion(
  input: GenerateQuestionInput,
  parsed: ParsedQuestion,
): Promise<StoredQuestionRow | null> {
  const { userId, noteId, chunkId, bloomLevel, questionType } = input;
  return sql.begin(async (tx: postgres.TransactionSql) => {
    const [inserted] = await tx<StoredQuestionRow[]>`
      INSERT INTO app.quiz_questions
        (id, user_id, note_id, chunk_id, question_type, bloom_level,
         question_text, options, correct_answer, explanation)
      SELECT
        ${generateUUID()}::uuid, ${userId}::uuid, ${noteId}::uuid, ${chunkId}::uuid,
        ${questionType}, ${bloomLevel},
        ${parsed.question_text},
        ${parsed.options ? JSON.stringify(parsed.options) : null}::text::jsonb,
        ${parsed.correct_answer},
        ${parsed.explanation}
      WHERE EXISTS (
        SELECT 1 FROM app.chunks c
        JOIN app.notes n ON n.note_id = c.document_id
        WHERE c.id = ${chunkId}::uuid
          AND c.user_id = ${userId}::uuid
          AND c.document_id = ${noteId}::uuid
          AND n.deleted_at IS NULL
      )
      ON CONFLICT (user_id, chunk_id, bloom_level) DO NOTHING
      RETURNING id, question_type, question_text, options, correct_answer, explanation
    `;
    const row = inserted ?? (await findStoredQuestion(tx, input));
    if (!row) return null;
    await ensureCard(tx, userId, row.id);
    return row;
  });
}

async function recentCourseQuestions(
  userId: string,
  courseId: string | undefined,
): Promise<string[]> {
  if (!courseId) return [];
  const rows = await sql<Array<{ question_text: string }>>`
    SELECT qq.question_text
    FROM app.quiz_questions qq
    JOIN app.notes n ON qq.note_id = n.note_id
    WHERE qq.user_id = ${userId}::uuid
      AND n.canvas_course_id = ${courseId}::bigint
      AND n.deleted_at IS NULL
    ORDER BY qq.created_at DESC
    LIMIT 5
  `;
  return rows.map(({ question_text }) => question_text);
}

// generate a question for a chunk and persist it with its card
export async function generateQuestion(
  input: GenerateQuestionInput,
): Promise<QuizQuestion | null> {
  const { userId, chunkId, bloomLevel, questionType } = input;

  try {
    // a question at this level already exists, so skip the LLM entirely and
    // just make sure it is schedulable
    const stored = await sql.begin(async (tx: postgres.TransactionSql) => {
      const row = await findStoredQuestion(tx, input);
      if (row) await ensureCard(tx, userId, row.id);
      return row;
    });
    if (stored) return toQuizQuestion(input, stored);
  } catch (err) {
    logger.error("quiz generation: failed to check existing question", {
      chunkId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const cleanedChunkText = stripQuizArtifacts(input.chunkText);
  const limitedChunkText =
    cleanedChunkText.length > MAX_CHUNK_CHARS
      ? `${cleanedChunkText.slice(0, MAX_CHUNK_CHARS)}\n\n[truncated for question generation]`
      : cleanedChunkText;

  let raw = "";
  try {
    const prompt = buildGenerationPrompt(
      limitedChunkText,
      input.moduleName,
      bloomLevel,
      questionType,
      await recentCourseQuestions(userId, input.courseId),
      questionType === "true_false" ? pickTrueFalseTarget() : undefined,
    );
    raw = await callLLM(prompt);
  } catch (err) {
    logger.error("quiz generation LLM call failed", {
      chunkId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (isSkipSignal(raw)) {
    logger.info("quiz generation: skipping non-educational chunk", { chunkId });
    return null;
  }

  const parsed = parseGeneratedQuestion(raw, questionType);
  if (!parsed) {
    logger.warn("quiz generation: failed to parse LLM response", {
      chunkId,
      raw: raw.slice(0, 500),
    });
    return null;
  }

  try {
    const row = await persistQuestion(input, parsed);
    if (!row) {
      logger.info("quiz generation: source chunk changed before save", { chunkId });
      return null;
    }
    return toQuizQuestion(input, row);
  } catch (err) {
    logger.error("quiz generation: failed to save question", {
      chunkId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
