import { BLOOM_NAMES, BLOOM_DESCRIPTIONS, QUIZ_GENERATION_MAX_FAILURES } from "./types";
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
  getLlmModel,
  getLlmThinkingMode,
} from "@/lib/ai-config";
import { generateText } from "ai";
import { z } from "zod";
import type postgres from "postgres";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";

const MAX_CHUNK_CHARS = 4000;
// the reply is one small JSON object, so nearly all of a call's output tokens
// are reasoning. quiz calls get their own ceiling and effort instead of chat's
// 8k at high, and every call logs its usage so the cap can be tuned on evidence
const QUIZ_MAX_OUTPUT_TOKENS = 4_096;
const QUIZ_REASONING_EFFORT = "medium";

export type TrueFalseTarget = "true" | "false";

// asking the model for a true or a false statement skews it towards true, and
// pinning the answer made it write true statements keyed False. it now writes
// both and the code picks one, so the key is right by construction
function pickTrueFalseTarget(): TrueFalseTarget {
  return Math.random() < 0.5 ? "true" : "false";
}

// what each level should demand, so higher levels are genuinely harder rather than reworded recall
const LEVEL_GUIDANCE: Record<BloomLevel, string> = {
  1: "Ask for a core definition or fact the rest of the topic depends on. No trivia.",
  2: "Ask why or how something works, or to tell two related ideas apart. Do not ask for a definition or a plain fact lookup.",
  3: "Give a new concrete scenario with every input stated (values, code, a situation) and ask the student to apply the idea: calculate, trace, or choose the right approach.",
  4: "Ask the student to analyse: weigh a trade-off, find the flaw in a described approach, or predict what changes when one part of a system changes.",
};

export interface GenerationPromptInput {
  /** the passage the question must test */
  focusText: string;
  /** neighbouring text that only helps the model read the focus passage */
  contextText?: string;
  moduleName: string;
  bloomLevel: BloomLevel;
  questionType: QuestionType;
  /** questions already asked on this note, which must not be repeated */
  existingQuestions?: string[];
}

export function buildGenerationPrompt({
  focusText,
  contextText,
  moduleName,
  bloomLevel,
  questionType,
  existingQuestions,
}: GenerationPromptInput): string {
  const levelName = BLOOM_NAMES[bloomLevel];
  const levelDesc = BLOOM_DESCRIPTIONS[bloomLevel];

  let typeInstruction = "";
  let replyShape = `{
  "question_text": "...",
  "options": [{"text": "...", "is_correct": true/false}, ...] or null,
  "correct_answer": "...",
  "explanation": "..."
}`;
  switch (questionType) {
    case "mcq":
      typeInstruction =
        "Generate a multiple choice question with exactly 4 options. Exactly one option must be correct, and the wrong options must be plausible to someone who half-understands the topic.";
      break;
    case "true_false":
      typeInstruction =
        "Generate a true/false item as a pair of statements about the same idea. true_statement must be accurate. false_statement must change one meaningful detail so it is wrong to someone who understands the topic, not a wording trick or an added \"not\". The explanation must teach the idea without saying which statement the student saw.";
      replyShape = `{
  "true_statement": "...",
  "false_statement": "...",
  "explanation": "..."
}`;
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

Focus passage (the question must test this):
---
${focusText}
---
${contextText ? `
Surrounding text, only to help you read the focus passage:
---
${contextText}
---
` : ""}
Module: ${moduleName}
Question type: ${questionType}
Target cognitive level: ${levelName} (Bloom's Taxonomy level ${bloomLevel})
${levelDesc}
${LEVEL_GUIDANCE[bloomLevel]}

${typeInstruction}

Rules:
- The question must be fully self-contained — include all context needed to answer it within the question text itself
- Never say "according to the notes", "from the provided content", "in your notes", or any phrase implying the student can see source material
- Test transferable understanding a lecturer could set in an exam: a definition, principle, mechanism, trade-off, or a calculation whose inputs are all given in the question
- Never ask what a specific worked example, figure, diagram, table, dataset, or code listing from the source shows or outputs (e.g. "the decision tree for the Iris data would classify..."). The student cannot see it, so the answer is unknowable. If the source is mostly such an example, ask about the general technique it illustrates, or return {"skip": true}
- Never ask what a course, syllabus, outline, slide or document lists, mentions or covers. Ask about the concept itself
- No trivia: dates, deadlines, version numbers, installation steps, tool defaults, people's names, rooms or timetables
- Never ask how a particular named script, class or file from an assignment behaves. Ask about the general programming idea behind it
- The question must have one defensible answer without guessing at hidden details
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
${replyShape}
or if the content is not suitable:
{"skip": true}
${
  existingQuestions && existingQuestions.length > 0
    ? `
IMPORTANT: These questions already exist on this material. Do not repeat or rephrase any of them:
${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}
Ask about a DIFFERENT concept or aspect of the material, or test the same idea at a deeper level.`
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
  /** neighbouring chunks, only for reading the focus chunk */
  contextText?: string;
  moduleName: string;
  bloomLevel: BloomLevel;
  questionType: QuestionType;
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

const trueFalsePairSchema = z.object({
  true_statement: nonBlankString,
  false_statement: nonBlankString,
  explanation: z.string().optional().catch("").transform((value) => value ?? ""),
});

function parseTrueFalsePair(raw: string, target: TrueFalseTarget): ParsedQuestion | null {
  const result = trueFalsePairSchema.safeParse(parseJsonObject(raw));
  if (!result.success) return null;
  const { true_statement, false_statement, explanation } = result.data;
  if (true_statement.trim() === false_statement.trim()) return null;
  const isTrue = target === "true";
  const answer = isTrue ? "True" : "False";
  return {
    question_text: `True or false: ${(isTrue ? true_statement : false_statement).trim()}`,
    options: [
      { text: "True", is_correct: isTrue },
      { text: "False", is_correct: !isTrue },
    ],
    correct_answer: answer,
    explanation: isTrue
      ? `**True.**\n\n${explanation}`.trim()
      : `**False.** The accurate statement is: ${true_statement.trim()}\n\n${explanation}`.trim(),
  };
}

export function parseGeneratedQuestion(
  raw: string,
  questionType: QuestionType,
  trueFalseTarget: TrueFalseTarget = "true",
): ParsedQuestion | null {
  if (questionType === "true_false") return parseTrueFalsePair(raw, trueFalseTarget);
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

interface LlmReply {
  text: string;
  // the reply hit the token ceiling, which says nothing about the chunk
  truncated: boolean;
}

async function callLLM(prompt: string, chunkId: string): Promise<LlmReply> {
  const provider = createLlmProvider();
  if (!provider) throw new Error("LLM not configured");

  const thinkingMode = getLlmThinkingMode();
  const reasoning = buildReasoningOptions(thinkingMode, QUIZ_REASONING_EFFORT);

  // the provider's fetch already enforces LLM_TIMEOUT_MS per attempt
  const { text, usage, finishReason } = await generateText({
    model: provider(getLlmModel()),
    prompt,
    maxOutputTokens: QUIZ_MAX_OUTPUT_TOKENS,
    ...(thinkingMode !== "off" && { temperature: 1 }),
    maxRetries: 3,
    providerOptions: { openrouter: { reasoning } },
  });
  logger.info("quiz generation usage", {
    chunkId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.outputTokenDetails.reasoningTokens,
    finishReason,
  });

  return { text, truncated: finishReason === "length" };
}

// two strikes for a skip, one for a garbled reply
async function recordGenerationFailure(userId: string, chunkId: string, strikes: number): Promise<void> {
  await sql`
    UPDATE app.chunks
    SET quiz_generation_failures = LEAST(quiz_generation_failures + ${strikes}, ${QUIZ_GENERATION_MAX_FAILURES})
    WHERE id = ${chunkId}::uuid AND user_id = ${userId}::uuid
  `.catch((err: unknown) => {
    logger.warn("quiz generation: failed to record a failure", {
      chunkId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
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

// questions already on this note, so a new one covers something else or goes deeper
async function existingNoteQuestions(userId: string, noteId: string): Promise<string[]> {
  const rows = await sql<Array<{ question_text: string }>>`
    SELECT question_text FROM app.quiz_questions
    WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
    ORDER BY created_at DESC
    LIMIT 15
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

  const limit = (text: string, chars: number) => {
    const cleaned = stripQuizArtifacts(text);
    return cleaned.length > chars
      ? `${cleaned.slice(0, chars)}\n\n[truncated for question generation]`
      : cleaned;
  };
  const trueFalseTarget = pickTrueFalseTarget();

  let reply: LlmReply;
  try {
    const prompt = buildGenerationPrompt({
      focusText: limit(input.chunkText, MAX_CHUNK_CHARS),
      contextText: input.contextText ? limit(input.contextText, MAX_CHUNK_CHARS) : undefined,
      moduleName: input.moduleName,
      bloomLevel,
      questionType,
      existingQuestions: await existingNoteQuestions(userId, input.noteId),
    });
    reply = await callLLM(prompt, chunkId);
  } catch (err) {
    logger.error("quiz generation LLM call failed", {
      chunkId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (reply.truncated) {
    logger.warn("quiz generation: reply hit the token ceiling", { chunkId });
    return null;
  }

  if (isSkipSignal(reply.text)) {
    logger.info("quiz generation: skipping non-educational chunk", { chunkId });
    await recordGenerationFailure(userId, chunkId, QUIZ_GENERATION_MAX_FAILURES);
    return null;
  }

  const parsed = parseGeneratedQuestion(reply.text, questionType, trueFalseTarget);
  if (!parsed) {
    logger.warn("quiz generation: failed to parse LLM response", {
      chunkId,
      raw: reply.text.slice(0, 500),
    });
    await recordGenerationFailure(userId, chunkId, 1);
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

// section cards share the normal quiz prompt, provider and response validation,
// but have no chunk row and must be persisted with their section provenance
export async function generateSectionQuestion(text: string, title: string, level: BloomLevel) {
  const reply = await callLLM(
    `${buildGenerationPrompt({ focusText: stripQuizArtifacts(text), moduleName: title, bloomLevel: level, questionType: "fill_in" })}\nUse British English.`,
    "section",
  );
  if (reply.truncated || isSkipSignal(reply.text)) return null;
  return parseGeneratedQuestion(reply.text, "fill_in");
}
