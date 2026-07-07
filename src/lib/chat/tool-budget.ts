import {
  type ModelMessage,
  type PrepareStepFunction,
  type StopCondition,
  type Tool,
  type ToolExecutionOptions,
  type ToolSet,
} from "ai";
import type { JSONValue } from "ai";

export const TOOL_CALL_LIMIT_USER_MESSAGE =
  "Tool access is exhausted for this turn, so this answer uses only the information already gathered.";

export const TOOL_CALL_LIMIT_TOOL_RESULT_MESSAGE =
  "You are out of tool calls this turn. Do not attempt another tool call in this response. Continue using the information already gathered. If more tool calls are necessary, ask the user to send another message to continue with a fresh tool-call budget.";

const TOOL_CALL_LIMIT_RESULT_TYPE = "tool-call-limit";

type BudgetToolResultOutput =
  | { type: "text"; value: string }
  | { type: "json"; value: JSONValue };

const TOOL_CALL_LIMIT_MODEL_INSTRUCTION =
  "The last tool result means tool access is exhausted for this turn. Do not attempt another tool call. " +
  "Continue the task and give the user the best final answer using the information already gathered. " +
  "If the available information is incomplete and more tool calls would materially improve the answer, ask the user to send another message to continue with a fresh tool-call budget. " +
  "Do not discard useful progress.";

export function buildToolBudgetInstruction(maxToolSteps: number): string {
  return (
    `TOOL BUDGET: You have up to ${maxToolSteps} tool-call attempts this turn. ` +
    "If you attempt another tool call after the budget is used, the tool result will say that tool calls are exhausted. " +
    "When that happens, continue from the results already gathered. If the remaining work genuinely needs more tools, ask the user to send another message to continue with a fresh budget."
  );
}

export interface ToolBudgetControls {
  stopWhen: StopCondition<ToolSet>;
  prepareStep: PrepareStepFunction<ToolSet>;
  tools: ToolSet;
}

export function buildToolBudgetControls(
  maxToolSteps: number,
  tools: ToolSet,
): ToolBudgetControls {
  const budget = {
    remainingToolCalls: maxToolSteps,
    exhausted: false,
  };
  const safetyStepLimit = maxToolSteps + 3;

  return {
    tools: wrapToolsWithBudget(tools, budget),
    stopWhen: ({ steps }) => steps.length >= safetyStepLimit,
    prepareStep: ({ messages }) => {
      if (!budget.exhausted) return undefined;

      const limitInstruction: ModelMessage = {
        role: "system",
        content: TOOL_CALL_LIMIT_MODEL_INSTRUCTION,
      };

      return {
        activeTools: [],
        toolChoice: "none",
        messages: [...messages, limitInstruction],
      };
    },
  };
}

interface ToolCallLimitResult {
  type: typeof TOOL_CALL_LIMIT_RESULT_TYPE;
  message: string;
  attemptedTool: string;
  remainingToolCalls: 0;
}

function makeToolCallLimitResult(toolName: string): ToolCallLimitResult {
  return {
    type: TOOL_CALL_LIMIT_RESULT_TYPE,
    message: TOOL_CALL_LIMIT_TOOL_RESULT_MESSAGE,
    attemptedTool: toolName,
    remainingToolCalls: 0,
  };
}

function isToolCallLimitResult(output: unknown): output is ToolCallLimitResult {
  return (
    !!output &&
    typeof output === "object" &&
    (output as { type?: unknown }).type === TOOL_CALL_LIMIT_RESULT_TYPE
  );
}

function toDefaultModelOutput(output: unknown): BudgetToolResultOutput {
  return typeof output === "string"
    ? { type: "text", value: output }
    : { type: "json", value: (output ?? null) as JSONValue };
}

function wrapToolsWithBudget(
  tools: ToolSet,
  budget: { remainingToolCalls: number; exhausted: boolean },
): ToolSet {
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, originalTool]) => [
      toolName,
      wrapToolWithBudget(toolName, originalTool, budget),
    ]),
  ) as ToolSet;
}

function wrapToolWithBudget(
  toolName: string,
  originalTool: Tool,
  budget: { remainingToolCalls: number; exhausted: boolean },
): Tool {
  const originalExecute = originalTool.execute;
  if (!originalExecute) return originalTool;

  return {
    ...originalTool,
    execute: (input: unknown, options: ToolExecutionOptions) => {
      if (budget.remainingToolCalls <= 0) {
        budget.exhausted = true;
        return makeToolCallLimitResult(toolName);
      }

      budget.remainingToolCalls -= 1;
      return originalExecute.call(originalTool, input, options);
    },
    toModelOutput: async ({ toolCallId, input, output }) => {
      if (isToolCallLimitResult(output)) {
        return { type: "text", value: output.message };
      }

      if (originalTool.toModelOutput) {
        return originalTool.toModelOutput({ toolCallId, input, output });
      }

      return toDefaultModelOutput(output);
    },
  } as Tool;
}

export function isToolCallLimitFinish(
  finishReason: string | undefined,
  stepCount: number,
  maxToolSteps: number,
): boolean {
  return finishReason === "tool-calls" && stepCount >= maxToolSteps;
}

export function appendToolCallLimitMessage(reply: string): {
  reply: string;
  delta: string;
} {
  const delta = `${reply.trim() ? "\n\n" : ""}${TOOL_CALL_LIMIT_USER_MESSAGE}`;
  return {
    reply: `${reply.trimEnd()}${delta}`,
    delta,
  };
}
