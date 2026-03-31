const DEFAULT_LLM_TIMEOUT_MS = 20_000;
const DEFAULT_LLM_MAX_TOKENS = 2_048;
const DEFAULT_COHERE_TIMEOUT_MS = 8_000;

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

export function getLlmTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return readBoundedInt(
    env.LLM_TIMEOUT_MS,
    DEFAULT_LLM_TIMEOUT_MS,
    1_000,
    60_000,
  );
}

export function getLlmMaxTokens(env: NodeJS.ProcessEnv = process.env): number {
  return readBoundedInt(env.LLM_MAX_TOKENS, DEFAULT_LLM_MAX_TOKENS, 128, 4_096);
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
