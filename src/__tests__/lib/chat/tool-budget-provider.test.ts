import { describe, expect, it, vi } from "vitest";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, streamText, tool } from "ai";
import { z } from "zod";
import { buildToolBudgetControls, TOOL_CALL_LIMIT_TOOL_RESULT_MESSAGE, TOOL_CALL_LIMIT_USER_MESSAGE } from "@/lib/chat/tool-budget";

import { buildChatGenerationFromSteps, finalizeChatGenerationResult } from "@/lib/chat/generation-result";

const requestSchema = z.object({
  stream: z.boolean().optional(),
  tool_choice: z.unknown().optional(),
  tools: z.array(z.object({ function: z.object({ name: z.string() }) })).optional(),
  messages: z.array(z.object({ role: z.string(), content: z.unknown().optional() })),
});

describe("tool budget through the real OpenRouter adapter", () => {
  it.each([
    { streaming: false, ignoresProhibition: false },
    { streaming: true, ignoresProhibition: false },
    { streaming: false, ignoresProhibition: true },
    { streaming: true, ignoresProhibition: true },
    { streaming: false, ignoresProhibition: true, neverAnswers: true },
    { streaming: true, ignoresProhibition: true, neverAnswers: true },
  ])("sends the prohibition and enforces the budget, $streaming/$ignoresProhibition", async ({ streaming, ignoresProhibition, neverAnswers = false }) => {
    const requests: z.infer<typeof requestSchema>[] = [];
    const execute = vi.fn(async () => ({ fact: "The project is worth 40%." }));
    const provider = createOpenRouter({
      apiKey: "local-test-only",
      fetch: async (_input, init) => {
        const body = requestSchema.parse(JSON.parse(String(init?.body)));
        requests.push(body);
        const first = neverAnswers || requests.length === 1 || (ignoresProhibition && requests.length === 2);
        const message = first
          ? { role: "assistant", content: null, tool_calls: [{ id: `lookup-${requests.length}`, type: "function", function: { name: "lookup", arguments: "{}" } }] }
          : { role: "assistant", content: "The project is worth 40%." };
        const finishReason = first ? "tool_calls" : "stop";
        const envelope = { id: `completion-${requests.length}`, object: "chat.completion", created: 1, model: "deepseek/deepseek-v3.2" };
        if (body.stream) {
          const chunks = [
            { ...envelope, choices: [{ index: 0, delta: first ? { ...message, tool_calls: message.tool_calls?.map(call => ({ ...call, index: 0 })) } : message, finish_reason: null }] },
            { ...envelope, choices: [{ index: 0, delta: {}, finish_reason: finishReason }] },
          ];
          return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
        }
        return Response.json({ ...envelope, choices: [{ index: 0, message, finish_reason: finishReason }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
      },
    });
    const controls = buildToolBudgetControls(1, { lookup: tool({ inputSchema: z.object({}), execute }) });
    const options = { model: provider("deepseek/deepseek-v3.2"), instructions: "Search notes then answer.", prompt: "What is the project worth?", ...controls };
    const result = streaming ? streamText(options) : await generateText(options);
    expect(await result.text).toBe(neverAnswers ? "" : "The project is worth 40%.");
    const finalized = finalizeChatGenerationResult(buildChatGenerationFromSteps([], await result.steps), 1);
    expect(finalized.kind).toBe(neverAnswers ? "tool-call-limit" : "complete");
    expect(finalized.result.reply).toBe(neverAnswers ? TOOL_CALL_LIMIT_USER_MESSAGE : "The project is worth 40%.");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(neverAnswers ? 4 : ignoresProhibition ? 3 : 2);
    expect(requests[0]?.tool_choice).toBe("auto");
    expect(requests[1]?.tool_choice).toBe("none");
    expect(requests[1]?.tools).toEqual([expect.objectContaining({ function: { name: "lookup" } })]);
    expect(requests[1]?.messages.some(message => message.role === "tool")).toBe(true);
    if (ignoresProhibition) {
      expect(requests[2]?.tool_choice).toBe("none");
      expect(requests[2]?.messages).toContainEqual({ role: "tool", content: TOOL_CALL_LIMIT_TOOL_RESULT_MESSAGE });
    }
  });
});
