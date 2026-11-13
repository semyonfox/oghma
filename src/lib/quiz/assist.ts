import { generateText } from "ai";
import {
  buildReasoningOptions,
  createLlmProvider,
  getLlmModel,
  getLlmThinkingMode,
} from "@/lib/ai-config";
import logger from "@/lib/logger";
import { acceptedFillAnswers, normalizeFillAnswer } from "./grade";
import type { QuizQuestion } from "./types";

export const QUIZ_ASSIST_MODES = ["hint", "simpler", "example"] as const;
export type QuizAssistMode = (typeof QUIZ_ASSIST_MODES)[number];

export function isQuizAssistMode(value: unknown): value is QuizAssistMode {
  return typeof value === "string" && (QUIZ_ASSIST_MODES as readonly string[]).includes(value);
}

export type QuizAssistQuestion = Pick<
  QuizQuestion,
  "question_text" | "question_type" | "options" | "correct_answer" | "explanation"
>;

// a hint is short by design, and the other two are a paragraph each
const ASSIST_MAX_OUTPUT_TOKENS = 1_024;
const SOURCE_EXCERPT_CHARS = 2_000;

const INSTRUCTIONS: Record<QuizAssistMode, string> = {
  hint: [
    "Give the student one Socratic hint for this question.",
    "Ask a guiding question or point at the concept they need to recall.",
    "Never state, quote, paraphrase or rule in or out the correct answer or any option.",
    "Keep it to one or two sentences.",
  ].join(" "),
  simpler: [
    "The student has already seen the answer. Explain why it is correct in plain, simple language,",
    "as if to someone meeting the topic for the first time. Keep it under 120 words.",
  ].join(" "),
  example: [
    "The student has already seen the answer. Give one short, concrete example that shows the idea behind it.",
    "Prefer an example that is different from the wording of the question. Keep it under 120 words.",
  ].join(" "),
};

export function buildQuizAssistPrompt(
  mode: QuizAssistMode,
  question: QuizAssistQuestion,
  sourceText: string | null,
): string {
  const lines = [INSTRUCTIONS[mode], "", `Question: ${question.question_text}`];
  const options = Array.isArray(question.options) ? question.options : [];
  if (options.length > 0) {
    lines.push("Options:", ...options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o.text}`));
  }
  // the hint prompt never sees the answer, so the model can't leak what it doesn't know
  if (mode !== "hint") {
    lines.push(`Correct answer: ${question.correct_answer}`);
    if (question.explanation) lines.push(`Existing explanation: ${question.explanation}`);
  }
  if (sourceText) {
    lines.push("", "Source from the student's notes:", sourceText.slice(0, SOURCE_EXCERPT_CHARS));
  }
  lines.push("", "Reply with the text only, in Markdown, without a preamble.");
  return lines.join("\n");
}

// the model works from the source excerpt too, which can contain the answer,
// so check the reply rather than trusting the prompt alone
export function hintRevealsAnswer(hint: string, question: QuizAssistQuestion): boolean {
  // true/false and very short answers show up in ordinary prose
  if (question.question_type === "true_false") return false;
  const reply = ` ${normalizeFillAnswer(hint)} `;
  return acceptedFillAnswers(question.correct_answer).some(
    (answer) => answer.length >= 3 && reply.includes(` ${answer} `),
  );
}

export class QuizAssistUnavailableError extends Error {}

export async function generateQuizAssist(
  mode: QuizAssistMode,
  question: QuizAssistQuestion,
  sourceText: string | null,
): Promise<string | null> {
  const provider = createLlmProvider();
  if (!provider) throw new QuizAssistUnavailableError("LLM not configured");

  const thinkingMode = getLlmThinkingMode();
  const { text, usage, finishReason } = await generateText({
    model: provider(getLlmModel()),
    prompt: buildQuizAssistPrompt(mode, question, sourceText),
    maxOutputTokens: ASSIST_MAX_OUTPUT_TOKENS,
    ...(thinkingMode !== "off" && { temperature: 1 }),
    maxRetries: 1,
    providerOptions: {
      openrouter: { reasoning: buildReasoningOptions(thinkingMode, "low") },
    },
  });
  logger.info("quiz assist usage", {
    mode,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    finishReason,
  });

  const reply = text.trim();
  if (!reply) return null;
  if (mode === "hint" && hintRevealsAnswer(reply, question)) return null;
  return reply;
}
