import {
  streamText,
  type FinishReason,
  type LanguageModel,
  type ModelMessage,
} from "ai";

const FINAL_ANSWER_INSTRUCTION =
  "Tool research is complete. Give the user the final answer now using the " +
  "information already gathered. Do not call tools or describe your reasoning.";

export interface FinalAnswerResult {
  text: string;
  finishReason: FinishReason | undefined;
  rawFinishReason: string | undefined;
}

export function shouldSynthesizeFinalAnswer(
  text: string,
  finishReason: FinishReason | undefined,
): boolean {
  return !text.trim() && (finishReason == null || finishReason === "stop");
}

export async function streamFinalAnswer(options: {
  model: LanguageModel;
  messages: ModelMessage[];
  maxOutputTokens: number;
  onTextDelta: (text: string) => void;
}): Promise<FinalAnswerResult> {
  const [firstMessage, ...remainingMessages] = options.messages;
  const messages: ModelMessage[] =
    firstMessage?.role === "system"
      ? [
          {
            ...firstMessage,
            content: `${firstMessage.content}\n\n${FINAL_ANSWER_INSTRUCTION}`,
          },
          ...remainingMessages,
        ]
      : [
          { role: "system", content: FINAL_ANSWER_INSTRUCTION },
          ...options.messages,
        ];

  const result = streamText({
    model: options.model,
    messages,
    maxOutputTokens: options.maxOutputTokens,
    providerOptions: {
      openrouter: { reasoning: { enabled: false, effort: "none" } },
    },
  });

  let text = "";
  let finishReason: FinishReason | undefined;
  let rawFinishReason: string | undefined;

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      text += part.text;
      options.onTextDelta(part.text);
    } else if (part.type === "finish-step" || part.type === "finish") {
      finishReason = part.finishReason;
      rawFinishReason = part.rawFinishReason;
    } else if (part.type === "error") {
      throw part.error instanceof Error
        ? part.error
        : new Error(String(part.error));
    }
  }

  return { text, finishReason, rawFinishReason };
}
