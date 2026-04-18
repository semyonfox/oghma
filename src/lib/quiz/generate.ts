import { BLOOM_NAMES, BLOOM_DESCRIPTIONS } from "./types";
import type { BloomLevel, QuestionType, QuizQuestion } from "./types";
import { generateUUID } from "@/lib/utils/uuid";
import {
  buildThinkingOptions,
  createLlmProvider,
  getLlmMaxTokens,
  getLlmModel,
  getLlmThinkingMode,
} from "@/lib/ai-config";
import type { MoonshotAILanguageModelOptions } from "@ai-sdk/moonshotai";
import { generateText } from "ai";
import sql from "@/database/pgsql.js";
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

interface ParsedQuestion {
  question_text: string;
  options: { text: string; is_correct: boolean }[] | null;
  correct_answer: string;
  explanation: string;
}

// extract and parse JSON from a raw LLM response (handles markdown code fences)
function extractJSON(raw: string): unknown {
  try {
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
    return JSON.parse(jsonMatch[1]!.trim());
  } catch {
    return null;
  }
}

export function isSkipSignal(raw: string): boolean {
  const parsed = extractJSON(raw);
  return (parsed as any)?.skip === true;
}

export function parseGeneratedQuestion(raw: string): ParsedQuestion | null {
  const parsed = extractJSON(raw) as any;
  if (
    !parsed ||
    !parsed.question_text?.trim() ||
    !parsed.correct_answer?.trim()
  ) {
    return null;
  }
  return {
    question_text: parsed.question_text,
    options: parsed.options ?? null,
    correct_answer: parsed.correct_answer,
    explanation: parsed.explanation ?? "",
  };
}

async function callLLM(prompt: string): Promise<string> {
  const provider = createLlmProvider();
  if (!provider) throw new Error("LLM not configured");

  const thinkingMode = getLlmThinkingMode();
  const moonshotOptions: MoonshotAILanguageModelOptions = {
    thinking: buildThinkingOptions(thinkingMode),
  };

  const { text } = await generateText({
    model: provider(getLlmModel()),
    prompt,
    maxOutputTokens: getLlmMaxTokens(),
    ...(thinkingMode !== "off" && { temperature: 1 }),
    maxRetries: 3,
    providerOptions: { moonshotai: moonshotOptions },
  });

  return text;
}

// generate a question for a chunk and save it to DB
export async function generateQuestion(
  userId: string,
  noteId: string,
  chunkId: string,
  chunkText: string,
  moduleName: string,
  bloomLevel: BloomLevel,
  questionType: QuestionType,
  courseId?: number,
): Promise<QuizQuestion | null> {
  const cleanedChunkText = chunkText
    .replace(/^\s*\{\d+\}-+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const limitedChunkText =
    cleanedChunkText.length > MAX_CHUNK_CHARS
      ? `${cleanedChunkText.slice(0, MAX_CHUNK_CHARS)}\n\n[truncated for question generation]`
      : cleanedChunkText;

  let existingQuestions: string[] = [];
  if (courseId) {
    const existing = await sql`
      SELECT qq.question_text
      FROM app.quiz_questions qq
      JOIN app.notes n ON qq.note_id = n.note_id
      WHERE qq.user_id = ${userId}::uuid
        AND n.canvas_course_id = ${courseId}
        AND n.deleted_at IS NULL
      ORDER BY qq.created_at DESC
      LIMIT 5
    `;
    existingQuestions = existing.map((r: any) => r.question_text);
  }

  const prompt = buildGenerationPrompt(
    limitedChunkText,
    moduleName,
    bloomLevel,
    questionType,
    existingQuestions,
    questionType === "true_false" ? pickTrueFalseTarget() : undefined,
  );

  let raw = "";
  try {
    raw = await callLLM(prompt);
  } catch (err) {
    logger.error("quiz generation LLM call failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (isSkipSignal(raw)) {
    logger.info("quiz generation: skipping non-educational chunk", { chunkId });
    return null;
  }

  const parsed = parseGeneratedQuestion(raw);
  if (!parsed) {
    logger.warn("quiz generation: failed to parse LLM response", {
      raw: raw.slice(0, 500),
    });
    return null;
  }

  let id = generateUUID();
  try {
    const existingQuestion = await sql`
      SELECT id, question_text, options, correct_answer, explanation
      FROM app.quiz_questions
      WHERE user_id = ${userId}::uuid
        AND chunk_id = ${chunkId}::uuid
        AND bloom_level = ${bloomLevel}
      ORDER BY created_at ASC
      LIMIT 1
    `;

    if (existingQuestion.length > 0) {
      const q = existingQuestion[0];
      id = q.id;
      return {
        id,
        user_id: userId,
        note_id: noteId,
        chunk_id: chunkId,
        question_type: questionType,
        bloom_level: bloomLevel,
        question_text: q.question_text,
        options: q.options,
        correct_answer: q.correct_answer,
        explanation: q.explanation ?? "",
      };
    }

    await sql`
      INSERT INTO app.quiz_questions
        (id, user_id, note_id, chunk_id, question_type, bloom_level, question_text, options, correct_answer, explanation)
      VALUES (
        ${id}::uuid, ${userId}::uuid, ${noteId}::uuid, ${chunkId}::uuid,
        ${questionType}, ${bloomLevel},
        ${parsed.question_text},
        ${parsed.options ? JSON.stringify(parsed.options) : null}::jsonb,
        ${parsed.correct_answer},
        ${parsed.explanation}
      )
    `;

    const existingCard = await sql`
      SELECT id FROM app.quiz_cards
      WHERE user_id = ${userId}::uuid AND question_id = ${id}::uuid
      LIMIT 1
    `;
    if (existingCard.length === 0) {
      const cardId = generateUUID();
      await sql`
        INSERT INTO app.quiz_cards (id, user_id, question_id)
        VALUES (${cardId}::uuid, ${userId}::uuid, ${id}::uuid)
      `;
    }
  } catch (err) {
    logger.error("quiz generation: failed to save question", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  return {
    id,
    user_id: userId,
    note_id: noteId,
    chunk_id: chunkId,
    question_type: questionType,
    bloom_level: bloomLevel,
    question_text: parsed.question_text,
    options: parsed.options,
    correct_answer: parsed.correct_answer,
    explanation: parsed.explanation,
  };
}
