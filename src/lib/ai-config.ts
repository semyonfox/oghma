// LLM provider config — generic OpenAI-compatible client via @openrouter/ai-sdk-provider.
// works against any OpenAI-compat endpoint (OpenRouter, SiliconFlow, Moonshot, OpenAI direct).
// reasoning is OR-specific: passes through to the provider when LLM_API_URL points at OR,
// silently ignored elsewhere (matches prior behaviour with Moonshot's `thinking` param).

import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const DEFAULT_LLM_TIMEOUT_MS = 300_000;
const DEFAULT_LLM_MAX_TOKENS = 8_192;
const DEFAULT_COHERE_TIMEOUT_MS = 8_000;
const DEFAULT_LLM_MODEL = "deepseek/deepseek-v3.2";

export type LlmThinkingMode = "auto" | "off";

export type LlmReasoningOptions = { enabled: true };

function readBoundedInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  if (parsed > max) return max;
  return parsed;
}

function normalizeThinkingMode(value: string | undefined): LlmThinkingMode {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "on" || normalized === "enabled") return "auto";
  if (normalized === "off" || normalized === "disabled") return "off";
  return "auto";
}

export function getLlmTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return readBoundedInt(
    env.LLM_TIMEOUT_MS,
    DEFAULT_LLM_TIMEOUT_MS,
    1_000,
    600_000,
  );
}

export function getLlmModel(env: NodeJS.ProcessEnv = process.env): string {
  const trimmed = (env.LLM_MODEL ?? "").trim();
  return trimmed || DEFAULT_LLM_MODEL;
}

export function getLlmThinkingMode(
  env: NodeJS.ProcessEnv = process.env,
): LlmThinkingMode {
  return normalizeThinkingMode(env.LLM_THINKING);
}

// map our user-facing two-state setting to OpenRouter's reasoning controls.
// off → omit reasoning (caller treats undefined as "no reasoning")
// auto → enable reasoning with the model/provider default budget
export function buildReasoningOptions(
  mode: LlmThinkingMode,
): LlmReasoningOptions | undefined {
  if (mode === "off") return undefined;
  return { enabled: true };
}

export function getLlmMaxTokens(env: NodeJS.ProcessEnv = process.env): number {
  return readBoundedInt(
    env.LLM_MAX_TOKENS,
    DEFAULT_LLM_MAX_TOKENS,
    128,
    32_768,
  );
}

export function getCohereTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return readBoundedInt(
    env.COHERE_TIMEOUT_MS,
    DEFAULT_COHERE_TIMEOUT_MS,
    1_000,
    20_000,
  );
}

export function createLlmProvider(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = (env.LLM_API_KEY ?? "").trim();
  if (!apiKey) return null;

  const baseURL = (env.LLM_API_URL ?? "").trim() || undefined;
  const timeoutMs = getLlmTimeoutMs(env);

  return createOpenRouter({
    apiKey,
    ...(baseURL && { baseURL }),
    fetch: (input, init) => {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = init?.signal
        ? AbortSignal.any([init.signal, timeoutSignal])
        : timeoutSignal;
      return fetch(input, { ...init, signal });
    },
  });
}
