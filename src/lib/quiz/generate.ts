import { BLOOM_NAMES, BLOOM_DESCRIPTIONS } from "./types";
import type { BloomLevel, QuestionType, QuizQuestion } from "./types";
import { generateUUID } from "@/lib/utils/uuid";
import { getLlmMaxTokens, getLlmTimeoutMs } from "@/lib/ai-config";
import sql from "@/database/pgsql.js";
import logger from "@/lib/logger";

const LLM_URL = process.env.LLM_API_URL;
const LLM_MODEL = process.env.LLM_MODEL || "kimi-k2.5";
const LLM_API_KEY = process.env.LLM_API_KEY;
const MAX_CHUNK_CHARS = 1800;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableLlmError(message: string): boolean {
  return (
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("overloaded") ||
    message.includes("429") ||
    message.includes("502") ||
    message.includes("503")
  );
}

export function buildGenerationPrompt(
  chunkText: string,
  moduleName: string,
  bloomLevel: BloomLevel,
  questionType: QuestionType,
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
      typeInstruction =
        'Generate a true/false question. Set options to [{text: "True", is_correct: true/false}, {text: "False", is_correct: true/false}].';
      break;
    case "fill_in":
      typeInstruction =
        "Generate a fill-in-the-blank question. Set options to null. The correct_answer should be the expected word or short phrase.";
      break;
    default:
      typeInstruction = "Generate a multiple choice question with 4 options.";
  }

  return `You are generating a study question from university lecture notes.

Content from the student's notes:
---
${chunkText}
---

Module: ${moduleName}
Question type: ${questionType}
Target cognitive level: ${levelName} (Bloom's Taxonomy level ${bloomLevel})
${levelDesc}

${typeInstruction}

Rules:
- ONLY use information from the provided content
- Do NOT introduce concepts beyond this module's scope
- Match difficulty to the cognitive level, not beyond
- Provide a clear 1-2 sentence explanation referencing the source material

Return ONLY valid JSON with this exact structure:
{
  "question_text": "...",
  "options": [{"text": "...", "is_correct": true/false}, ...] or null,
  "correct_answer": "...",
  "explanation": "..."
}`;
}

interface ParsedQuestion {
  question_text: string;
  options: { text: string; is_correct: boolean }[] | null;
  correct_answer: string;
  explanation: string;
}

export function parseGeneratedQuestion(raw: string): ParsedQuestion | null {
  try {
    // extract JSON from potential markdown code fence
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
    const parsed = JSON.parse(jsonMatch[1]!.trim());

    if (!parsed.question_text?.trim() || !parsed.correct_answer?.trim()) {
      return null;
    }

    return {
      question_text: parsed.question_text,
      options: parsed.options ?? null,
      correct_answer: parsed.correct_answer,
      explanation: parsed.explanation ?? "",
    };
  } catch {
    return null;
  }
}

async function callLLM(prompt: string): Promise<string> {
  if (!LLM_API_KEY || !LLM_URL) throw new Error("LLM not configured");

  const thinking =
    process.env.LLM_THINKING === "off"
      ? ({ type: "disabled" } as const)
      : undefined;

  const body: Record<string, unknown> = {
    model: LLM_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_tokens: getLlmMaxTokens(),
  };
  if (thinking) body.thinking = thinking;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${LLM_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(getLlmTimeoutMs()),
      });

      if (!res.ok) {
        const responseBody = await res.text().catch(() => "");
        const message = `LLM error (${res.status}): ${responseBody.slice(0, 200)}`;
        if (attempt < 3 && isRetryableLlmError(message.toLowerCase())) {
          await sleep(500 * attempt);
          continue;
        }
        throw new Error(message);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < 3 && isRetryableLlmError(message.toLowerCase())) {
        await sleep(500 * attempt);
        continue;
      }
      throw err;
    }
  }

  throw new Error("LLM request failed after retries");
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
): Promise<QuizQuestion | null> {
  const limitedChunkText =
    chunkText.length > MAX_CHUNK_CHARS
      ? `${chunkText.slice(0, MAX_CHUNK_CHARS)}\n\n[truncated for question generation]`
      : chunkText;
  const prompt = buildGenerationPrompt(
    limitedChunkText,
    moduleName,
    bloomLevel,
    questionType,
  );

  let raw: string;
  try {
    raw = await callLLM(prompt);
  } catch (err) {
    logger.error("quiz generation LLM call failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const parsed = parseGeneratedQuestion(raw);
  if (!parsed) {
    logger.warn("quiz generation: failed to parse LLM response", {
      raw: raw.slice(0, 500),
    });
    return null;
  }

  const id = generateUUID();
  try {
    await sql`
            INSERT INTO app.quiz_questions (id, user_id, note_id, chunk_id, question_type, bloom_level, question_text, options, correct_answer, explanation)
            VALUES (
                ${id}::uuid,
                ${userId}::uuid,
                ${noteId}::uuid,
                ${chunkId}::uuid,
                ${questionType},
                ${bloomLevel},
                ${parsed.question_text},
                ${parsed.options ? JSON.stringify(parsed.options) : null}::jsonb,
                ${parsed.correct_answer},
                ${parsed.explanation}
            )
            ON CONFLICT (user_id, chunk_id, bloom_level) DO NOTHING
        `;

    // create the FSRS card
    const cardId = generateUUID();
    await sql`
            INSERT INTO app.quiz_cards (id, user_id, question_id)
            VALUES (${cardId}::uuid, ${userId}::uuid, ${id}::uuid)
            ON CONFLICT (user_id, question_id) DO NOTHING
        `;
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
