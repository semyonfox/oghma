import { describe, expect, it } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import {
  TOOL_CALL_LIMIT_TOOL_RESULT_MESSAGE,
  TOOL_CALL_LIMIT_USER_MESSAGE,
  buildToolBudgetInstruction,
  appendToolCallLimitMessage,
  buildToolBudgetControls,
  isToolCallLimitFinish,
} from "@/lib/chat/tool-budget";

describe("tool budget controls", () => {
  const toolOptions = {
    toolCallId: "call-1",
    messages: [],
  };

  it("returns real tool results while budget remains", async () => {
    const controls = buildToolBudgetControls(1, {
      lookup: tool({
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
      }),
    });

    const result = await controls.tools.lookup.execute?.({}, toolOptions);

    expect(result).toEqual({ ok: true });
  });

  it("returns a tool result when a tool call exceeds the budget", async () => {
    const controls = buildToolBudgetControls(1, {
      lookup: tool({
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
      }),
    });

    await controls.tools.lookup.execute?.({}, toolOptions);
    const result = await controls.tools.lookup.execute?.({}, toolOptions);

    expect(result).toMatchObject({
      type: "tool-call-limit",
      message: TOOL_CALL_LIMIT_TOOL_RESULT_MESSAGE,
      attemptedTool: "lookup",
      remainingToolCalls: 0,
    });
  });

  it("keeps tools enabled before the budget is exhausted", async () => {
    const controls = buildToolBudgetControls(2, {});
    const result = await controls.prepareStep({
      steps: Array.from({ length: 1 }, () => ({})) as Parameters<
        typeof controls.prepareStep
      >[0]["steps"],
      stepNumber: 1,
      model: {} as Parameters<typeof controls.prepareStep>[0]["model"],
      messages: [],
      experimental_context: undefined,
    });

    expect(result).toBeUndefined();
  });

  it("disables tools after the model receives the out-of-tool-calls result", async () => {
    const controls = buildToolBudgetControls(1, {
      lookup: tool({
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
      }),
    });
    await controls.tools.lookup.execute?.({}, toolOptions);
    await controls.tools.lookup.execute?.({}, toolOptions);

    const result = await controls.prepareStep({
      steps: Array.from({ length: 2 }, () => ({})) as Parameters<
        typeof controls.prepareStep
      >[0]["steps"],
      stepNumber: 2,
      model: {} as Parameters<typeof controls.prepareStep>[0]["model"],
      messages: [{ role: "user", content: "summarise" }],
      experimental_context: undefined,
    });

    expect(result?.activeTools).toEqual([]);
    expect(result?.toolChoice).toBe("none");
    expect(result?.messages).toHaveLength(2);
    expect(result?.messages?.[1]).toMatchObject({
      role: "system",
      content: expect.stringContaining("Continue the task"),
    });
  });

  it("shows the limit result to the model as text", async () => {
    const controls = buildToolBudgetControls(0, {
      lookup: tool({
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
      }),
    });

    const result = await controls.tools.lookup.execute?.({}, toolOptions);
    const modelOutput = await controls.tools.lookup.toModelOutput?.({
      toolCallId: "call-2",
      input: {},
      output: result,
    });

    expect(modelOutput).toEqual({
      type: "text",
      value: TOOL_CALL_LIMIT_TOOL_RESULT_MESSAGE,
    });
  });

  it("instructs the model to preserve progress after tools are disabled", () => {
    expect(buildToolBudgetInstruction(3)).toContain(
      "up to 3 tool-call attempts",
    );
    expect(buildToolBudgetInstruction(3)).toContain(
      "ask the user to send another message",
    );
  });
});

describe("tool-call limit fallback message", () => {
  it("appends the notice as normal assistant text", () => {
    expect(appendToolCallLimitMessage("Partial answer.")).toEqual({
      reply: `Partial answer.\n\n${TOOL_CALL_LIMIT_USER_MESSAGE}`,
      delta: `\n\n${TOOL_CALL_LIMIT_USER_MESSAGE}`,
    });
  });

  it("uses only the notice when no text was generated", () => {
    expect(appendToolCallLimitMessage("")).toEqual({
      reply: TOOL_CALL_LIMIT_USER_MESSAGE,
      delta: TOOL_CALL_LIMIT_USER_MESSAGE,
    });
  });

  it("detects only tool-call finishes at or beyond the budget", () => {
    expect(isToolCallLimitFinish("tool-calls", 2, 2)).toBe(true);
    expect(isToolCallLimitFinish("tool-calls", 1, 2)).toBe(false);
    expect(isToolCallLimitFinish("stop", 2, 2)).toBe(false);
  });
});
