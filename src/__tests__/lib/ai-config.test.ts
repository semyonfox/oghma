import { describe, expect, it } from "vitest";
import {
  getCohereTimeoutMs,
  getLlmMaxTokens,
  getLlmTimeoutMs,
} from "@/lib/ai-config";

describe("ai-config", () => {
  it("uses sane defaults when env vars are missing", () => {
    const env = {} as NodeJS.ProcessEnv;

    expect(getLlmTimeoutMs(env)).toBe(20_000);
    expect(getLlmMaxTokens(env)).toBe(2_048);
    expect(getCohereTimeoutMs(env)).toBe(8_000);
  });

  it("falls back to defaults for invalid values", () => {
    const env = {
      LLM_TIMEOUT_MS: "nope",
      LLM_MAX_TOKENS: "-1",
      COHERE_TIMEOUT_MS: "0",
    } as unknown as NodeJS.ProcessEnv;

    expect(getLlmTimeoutMs(env)).toBe(20_000);
    expect(getLlmMaxTokens(env)).toBe(2_048);
    expect(getCohereTimeoutMs(env)).toBe(8_000);
  });

  it("clamps very large values to safe upper bounds", () => {
    const env = {
      LLM_TIMEOUT_MS: "600000",
      LLM_MAX_TOKENS: "999999",
      COHERE_TIMEOUT_MS: "200000",
    } as unknown as NodeJS.ProcessEnv;

    expect(getLlmTimeoutMs(env)).toBe(60_000);
    expect(getLlmMaxTokens(env)).toBe(4_096);
    expect(getCohereTimeoutMs(env)).toBe(20_000);
  });
});
