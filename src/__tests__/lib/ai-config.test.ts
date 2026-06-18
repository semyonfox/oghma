import { describe, expect, it } from "vitest";
import {
  buildReasoningOptions,
  createLlmProvider,
  getCohereTimeoutMs,
  getLlmMaxTokens,
  getLlmModel,
  getLlmThinkingMode,
  getLlmTimeoutMs,
} from "@/lib/ai-config";

describe("ai-config", () => {
  it("uses sane defaults when env vars are missing", () => {
    const env = {} as NodeJS.ProcessEnv;

    expect(getLlmTimeoutMs(env)).toBe(300_000);
    expect(getLlmMaxTokens(env)).toBe(8_192);
    expect(getCohereTimeoutMs(env)).toBe(8_000);
  });

  it("falls back to defaults for invalid values", () => {
    const env = {
      LLM_TIMEOUT_MS: "nope",
      LLM_MAX_TOKENS: "-1",
      COHERE_TIMEOUT_MS: "0",
    } as unknown as NodeJS.ProcessEnv;

    expect(getLlmTimeoutMs(env)).toBe(300_000);
    expect(getLlmMaxTokens(env)).toBe(8_192);
    expect(getCohereTimeoutMs(env)).toBe(8_000);
  });

  it("clamps very large values to safe upper bounds", () => {
    const env = {
      LLM_TIMEOUT_MS: "9999999",
      LLM_MAX_TOKENS: "999999",
      COHERE_TIMEOUT_MS: "200000",
    } as unknown as NodeJS.ProcessEnv;

    expect(getLlmTimeoutMs(env)).toBe(600_000);
    expect(getLlmMaxTokens(env)).toBe(32_768);
    expect(getCohereTimeoutMs(env)).toBe(20_000);
  });

  it("returns the model from env or default", () => {
    expect(
      getLlmModel({
        LLM_MODEL: "deepseek/deepseek-v3.2",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("deepseek/deepseek-v3.2");
    expect(getLlmModel({ LLM_MODEL: "" } as unknown as NodeJS.ProcessEnv)).toBe(
      "deepseek/deepseek-v3.2",
    );
    expect(getLlmModel({} as unknown as NodeJS.ProcessEnv)).toBe(
      "deepseek/deepseek-v3.2",
    );
  });

  it("resolves thinking mode defaults and aliases", () => {
    expect(getLlmThinkingMode({} as unknown as NodeJS.ProcessEnv)).toBe("auto");
    expect(
      getLlmThinkingMode({
        LLM_THINKING: "enabled",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("auto");
    expect(
      getLlmThinkingMode({
        LLM_THINKING: "disabled",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("off");
    expect(
      getLlmThinkingMode({
        LLM_THINKING: "off",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("off");
  });

  it("maps thinking mode to OpenRouter reasoning effort", () => {
    expect(buildReasoningOptions("auto")).toEqual({ enabled: true });
    expect(buildReasoningOptions("off")).toBeUndefined();
  });

  it("returns null provider when no API key is set", () => {
    expect(createLlmProvider({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      createLlmProvider({ LLM_API_KEY: "" } as unknown as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(
      createLlmProvider({ LLM_API_KEY: "  " } as unknown as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("creates provider when LLM_API_KEY is set", () => {
    const p = createLlmProvider({
      LLM_API_KEY: "sk-test",
    } as unknown as NodeJS.ProcessEnv);
    expect(p).not.toBeNull();
  });
});
