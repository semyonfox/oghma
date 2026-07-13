import { describe, expect, it } from "vitest";
import {
  buildReasoningOptions,
  createLlmProvider,
  getCohereTimeoutMs,
  getLlmMaxToolSteps,
  getRagChunkSize,
  getLlmMaxTokens,
  getLlmModel,
  getLlmReasoningEffort,
  nextLlmThinkingMode,
  getRerankMinRelevance,
  getRerankTopN,
  getChatMaxDistance,
  getEmbeddingBatchSize,
  getLlmThinkingMode,
  getLlmTimeoutMs,
} from "@/lib/ai-config";

describe("ai-config", () => {
  it("uses sane defaults when env vars are missing", () => {
    const env = {} as NodeJS.ProcessEnv;

    expect(getLlmTimeoutMs(env)).toBe(300_000);
    expect(getLlmMaxTokens(env)).toBe(8_192);
    expect(getLlmMaxToolSteps(env)).toBe(10);
    expect(getCohereTimeoutMs(env)).toBe(8_000);
    expect(getRerankTopN(env)).toBe(5);
    expect(getRerankMinRelevance(env)).toBe(0.25);
    expect(getChatMaxDistance(env)).toBe(0.75);
    expect(getEmbeddingBatchSize(env)).toBe(96);
    expect(getRagChunkSize(env)).toBe(500);
  });

  it("falls back to defaults for invalid values", () => {
    const env = {
      LLM_TIMEOUT_MS: "nope",
      LLM_MAX_TOKENS: "-1",
      LLM_MAX_TOOL_STEPS: "0",
      COHERE_TIMEOUT_MS: "0",
    } as unknown as NodeJS.ProcessEnv;

    expect(getLlmTimeoutMs(env)).toBe(300_000);
    expect(getLlmMaxTokens(env)).toBe(8_192);
    expect(getLlmMaxToolSteps(env)).toBe(10);
    expect(getCohereTimeoutMs(env)).toBe(8_000);
    expect(getRerankTopN(env)).toBe(5);
    expect(getRerankMinRelevance(env)).toBe(0.25);
    expect(getChatMaxDistance(env)).toBe(0.75);
    expect(getEmbeddingBatchSize(env)).toBe(96);
    expect(getRagChunkSize(env)).toBe(500);
  });

  it("clamps very large values to safe upper bounds", () => {
    const env = {
      LLM_TIMEOUT_MS: "9999999",
      LLM_MAX_TOKENS: "999999",
      LLM_MAX_TOOL_STEPS: "999",
      COHERE_TIMEOUT_MS: "200000",
      RERANK_TOP_N: "25",
      RERANK_MIN_RELEVANCE: "2",
      CHAT_MAX_DISTANCE: "2",
      EMBEDDING_BATCH_SIZE: "900",
      RAG_CHUNK_SIZE: "9999",
    } as unknown as NodeJS.ProcessEnv;

    expect(getLlmTimeoutMs(env)).toBe(600_000);
    expect(getLlmMaxTokens(env)).toBe(32_768);
    expect(getLlmMaxToolSteps(env)).toBe(200);
    expect(getCohereTimeoutMs(env)).toBe(20_000);
    expect(getRerankTopN(env)).toBe(25);
    expect(getRerankMinRelevance(env)).toBe(1);
    expect(getChatMaxDistance(env)).toBe(1);
    expect(getEmbeddingBatchSize(env)).toBe(500);
    expect(getRagChunkSize(env)).toBe(4_000);
  });

  it("reads the max tool step cap from env", () => {
    expect(
      getLlmMaxToolSteps({
        LLM_MAX_TOOL_STEPS: "75",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(75);
  });

  it("reads RAG environment overrides", () => {
    expect(
      getRerankTopN({
        RERANK_TOP_N: "8",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(8);
    expect(
      getRerankMinRelevance({
        RERANK_MIN_RELEVANCE: "0.15",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(0.15);
    expect(
      getChatMaxDistance({
        CHAT_MAX_DISTANCE: "0.61",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(0.61);
    expect(
      getEmbeddingBatchSize({
        EMBEDDING_BATCH_SIZE: "12",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(12);
    expect(
      getRagChunkSize({
        RAG_CHUNK_SIZE: "333",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(333);
  });

  it("returns the model from env or default", () => {
    expect(
      getLlmModel({
        LLM_MODEL: "deepseek/deepseek-v4-flash",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("deepseek/deepseek-v4-flash");
    expect(getLlmModel({ LLM_MODEL: "" } as unknown as NodeJS.ProcessEnv)).toBe(
      "deepseek/deepseek-v4-flash",
    );
    expect(getLlmModel({} as unknown as NodeJS.ProcessEnv)).toBe(
      "deepseek/deepseek-v4-flash",
    );
  });

  it("uses high reasoning by default and validates overrides", () => {
    expect(getLlmReasoningEffort({} as NodeJS.ProcessEnv)).toBe("high");
    expect(
      getLlmReasoningEffort({
        LLM_REASONING_EFFORT: " high ",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("high");
    expect(
      getLlmReasoningEffort({
        LLM_REASONING_EFFORT: "xhigh",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("xhigh");
    expect(
      getLlmReasoningEffort({
        LLM_REASONING_EFFORT: "unsupported",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("high");
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
    expect(buildReasoningOptions("auto")).toEqual({
      enabled: true,
      effort: "high",
    });
    expect(buildReasoningOptions("auto", "high")).toEqual({
      enabled: true,
      effort: "high",
    });
    expect(buildReasoningOptions("off", "high")).toEqual({
      enabled: false,
      effort: "none",
    });
  });

  it("toggles thinking on and off", () => {
    expect(nextLlmThinkingMode("auto")).toBe("off");
    expect(nextLlmThinkingMode("off")).toBe("auto");
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
