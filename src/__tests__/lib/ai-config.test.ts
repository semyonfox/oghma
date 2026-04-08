import { describe, expect, it } from "vitest";
import {
  buildProviderThinking,
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

  it("normalizes common kimi model aliases", () => {
    expect(
      getLlmModel({ LLM_MODEL: "kimik2.5" } as unknown as NodeJS.ProcessEnv),
    ).toBe("kimi-k2.5");
    expect(
      getLlmModel({ LLM_MODEL: "kimi-2.5" } as unknown as NodeJS.ProcessEnv),
    ).toBe("kimi-k2.5");
    expect(getLlmModel({ LLM_MODEL: "" } as unknown as NodeJS.ProcessEnv)).toBe(
      "kimi-k2.5",
    );
  });

  it("resolves thinking mode defaults and aliases", () => {
    expect(getLlmThinkingMode({} as unknown as NodeJS.ProcessEnv)).toBe("auto");
    expect(
      getLlmThinkingMode({
        LLM_THINKING: "enabled",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("on");
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

  it("builds provider thinking payload from thinking mode", () => {
    // "auto" and "on" both enable thinking (Kimi K2.5 requires explicit config)
    expect(buildProviderThinking("auto")).toEqual({ type: "enabled" });
    expect(buildProviderThinking("on")).toEqual({ type: "enabled" });
    expect(buildProviderThinking("off")).toEqual({ type: "disabled" });
  });
});
