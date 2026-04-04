// LLM calling: non-streaming and streaming completions

import {
  buildProviderThinking,
  getLlmMaxTokens,
  getLlmModel,
  getLlmTimeoutMs,
  type LlmThinkingMode,
} from "@/lib/ai-config";
import { extractProviderText } from "./llm-stream";
import { parseSseBlocks } from "./sse";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

function buildRequestBody(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  thinkingMode: LlmThinkingMode,
  stream: boolean,
) {
  const model = getLlmModel();
  const maxTokens = getLlmMaxTokens();
  const thinking = buildProviderThinking(thinkingMode);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-8),
    { role: "user", content: userMessage },
  ];

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
  };
  if (thinking) body.thinking = thinking;
  if (stream) body.stream = true;

  return body;
}

function requireEnvVars() {
  const apiUrl = process.env.LLM_API_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!apiUrl) throw new Error("LLM_API_URL not configured");
  if (!apiKey) throw new Error("LLM_API_KEY not configured");
  return { apiUrl, apiKey };
}

export async function callLLM(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  thinkingMode: LlmThinkingMode,
): Promise<string> {
  const { apiUrl, apiKey } = requireEnvVars();
  const timeoutMs = getLlmTimeoutMs();
  const body = buildRequestBody(
    systemPrompt,
    history,
    userMessage,
    thinkingMode,
    false,
  );

  const res = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API error (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function* callLLMStream(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  thinkingMode: LlmThinkingMode,
): AsyncGenerator<string, void, unknown> {
  const { apiUrl, apiKey } = requireEnvVars();
  const timeoutMs = getLlmTimeoutMs();
  const body = buildRequestBody(
    systemPrompt,
    history,
    userMessage,
    thinkingMode,
    true,
  );

  // use an AbortController so we can implement an idle timeout that resets
  // on every chunk instead of aborting the entire stream after a fixed wall time
  const controller = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), timeoutMs);
  };

  // start the idle clock — covers the initial connection + first chunk wait
  resetIdleTimer();

  try {
    const res = await fetch(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM API error (${res.status}): ${text.slice(0, 200)}`);
    }

    if (!res.body) {
      throw new Error("LLM stream body missing");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const state = { buffer: "" };

    while (true) {
      const { value, done } = await reader.read();
      resetIdleTimer(); // data arrived — reset the idle clock
      const chunk = done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      if (chunk) {
        for (const frame of parseSseBlocks(chunk, state)) {
          if (frame.data === "[DONE]") return;
          try {
            const payload = JSON.parse(frame.data);
            const text = extractProviderText(payload);
            if (text) yield text;
          } catch {
            // ignore malformed or non-json chunks
          }
        }
      }
      if (done) return;
    }
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
  }
}
