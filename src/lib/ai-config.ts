import { createMoonshotAI } from "@ai-sdk/moonshotai";
import type { MoonshotAILanguageModelOptions } from "@ai-sdk/moonshotai";

const DEFAULT_LLM_TIMEOUT_MS = 300_000;
const DEFAULT_LLM_MAX_TOKENS = 8_192;
const DEFAULT_COHERE_TIMEOUT_MS = 8_000;
const DEFAULT_LLM_MODEL = "kimi-k2.5";

const LLM_MODEL_ALIASES: Record<string, string> = {
  "kimik2.5": "kimi-k2.5",
  "kimi-2.5": "kimi-k2.5",
  "kimi2.5": "kimi-k2.5",
  "kimi-k2.5": "kimi-k2.5",
};

export type LlmThinkingMode = "auto" | "on" | "off";

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
  if (normalized === "on" || normalized === "enabled") return "on";
  if (normalized === "off" || normalized === "disabled") return "off";
  return "auto";
}

function normalizeLlmModel(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return DEFAULT_LLM_MODEL;
  const normalized = trimmed.toLowerCase().replace(/\s+/g, "");
  return LLM_MODEL_ALIASES[normalized] ?? trimmed;
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
  return normalizeLlmModel(env.LLM_MODEL);
}

export function getLlmThinkingMode(
  env: NodeJS.ProcessEnv = process.env,
): LlmThinkingMode {
  return normalizeThinkingMode(env.LLM_THINKING);
}

// build the SDK-native thinking option from our env-based mode
export function buildThinkingOptions(
  mode: LlmThinkingMode,
): MoonshotAILanguageModelOptions["thinking"] {
  if (mode === "off") return { type: "disabled" };
  return { type: "enabled" };
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

// create the Moonshot provider, or null if no API key is configured
export function createLlmProvider(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = (env.LLM_API_KEY ?? env.MOONSHOT_API_KEY ?? "").trim();
  if (!apiKey) return null;

  const baseURL = (env.LLM_API_URL ?? "").trim() || undefined;
  const timeoutMs = getLlmTimeoutMs(env);

  return createMoonshotAI({
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
