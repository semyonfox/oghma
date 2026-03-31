# Chat SSE Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream AI chat responses token-by-token over SSE from `POST /api/chat` while preserving existing non-stream behavior.

**Architecture:** Keep one route with a `stream` request flag. Extract SSE formatting/parsing helpers and provider stream reading into focused utility modules. Persist user messages immediately and assistant messages once on stream completion.

**Tech Stack:** Next.js route handlers, React client, Fetch streaming APIs, Vitest.

---

### Task 1: Add SSE utilities (test-first)

**Files:**

- Create: `src/lib/chat/sse.ts`
- Create: `src/__tests__/lib/chat/sse.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { parseSseBlocks, toSseEvent } from "@/lib/chat/sse";

describe("chat SSE utils", () => {
  it("formats event payload as SSE block", () => {
    const out = toSseEvent("token", { text: "hi" });
    expect(out).toBe('event: token\ndata: {"text":"hi"}\n\n');
  });

  it("parses complete SSE blocks from chunked input", () => {
    const state = { buffer: "" };
    const a = parseSseBlocks('event: token\ndata: {"text":"hel', state);
    expect(a).toHaveLength(0);

    const b = parseSseBlocks('lo\"}\n\nevent: done\ndata: {}\n\n', state);
    expect(b).toEqual([
      { event: "token", data: '{"text":"hello"}' },
      { event: "done", data: "{}" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:ci -- src/__tests__/lib/chat/sse.test.ts`
Expected: FAIL with module/function missing

- [ ] **Step 3: Write minimal implementation**

```ts
export type SseFrame = { event: string; data: string };

export function toSseEvent(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function parseSseBlocks(
  chunk: string,
  state: { buffer: string },
): SseFrame[] {
  state.buffer += chunk;
  const out: SseFrame[] = [];
  let idx = state.buffer.indexOf("\n\n");
  while (idx !== -1) {
    const block = state.buffer.slice(0, idx);
    state.buffer = state.buffer.slice(idx + 2);
    const lines = block.split("\n");
    const event = lines
      .find((l) => l.startsWith("event:"))
      ?.slice(6)
      .trim();
    const data = lines
      .find((l) => l.startsWith("data:"))
      ?.slice(5)
      .trim();
    if (event && data !== undefined) out.push({ event, data });
    idx = state.buffer.indexOf("\n\n");
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:ci -- src/__tests__/lib/chat/sse.test.ts`
Expected: PASS

### Task 2: Add provider streaming helper (test-first)

**Files:**

- Create: `src/lib/chat/llm-stream.ts`
- Create: `src/__tests__/lib/chat/llm-stream.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { extractProviderText } from "@/lib/chat/llm-stream";

describe("extractProviderText", () => {
  it("extracts OpenAI-compatible delta content", () => {
    const t = extractProviderText({ choices: [{ delta: { content: "hi" } }] });
    expect(t).toBe("hi");
  });

  it("returns empty for non-content chunks", () => {
    const t = extractProviderText({ choices: [{ delta: {} }] });
    expect(t).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm run test:ci -- src/__tests__/lib/chat/llm-stream.test.ts`
Expected: FAIL with module/function missing

- [ ] **Step 3: Write minimal implementation**

```ts
export function extractProviderText(payload: any): string {
  return payload?.choices?.[0]?.delta?.content ?? "";
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:ci -- src/__tests__/lib/chat/llm-stream.test.ts`
Expected: PASS

### Task 3: Implement `/api/chat` stream mode with completion-time persistence

**Files:**

- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Add a failing API-focused test or helper test for stream response shape**

Use helper-level tests if route-level harness is heavy; verify stream event ordering requirement with fixture blocks.

- [ ] **Step 2: Implement stream branch**

Implementation requirements:

- parse `stream` from request body
- return SSE response with `meta -> token* -> done`
- call provider with `stream: true`
- buffer assistant text and persist once after provider completion
- emit `error` event and close on failures
- keep existing non-stream JSON path unchanged

- [ ] **Step 3: Run route-adjacent tests**

Run: `npm run test:ci -- src/__tests__/lib/chat/sse.test.ts src/__tests__/lib/chat/llm-stream.test.ts`
Expected: PASS

### Task 4: Update chat client to read SSE from POST

**Files:**

- Modify: `src/components/chat/chat-interface.tsx`

- [ ] **Step 1: Add failing parser/behavior test if feasible**

Prefer utility-level test for chunk parsing if component-level test setup is heavy.

- [ ] **Step 2: Implement SSE client handling**

Implementation requirements:

- send `stream: true` in body
- create assistant placeholder message before stream read
- parse event blocks from `ReadableStream`
- append `token` text to placeholder content
- apply `meta` session/sources updates
- on `done` set loading false
- on `error` show error and stop loading

- [ ] **Step 3: Run relevant tests**

Run: `npm run test:ci -- src/__tests__/lib/chat/sse.test.ts`
Expected: PASS

### Task 5: Verify and harden

**Files:**

- Modify: `.env.example` (optional if adding new documented flags)

- [ ] **Step 1: Run targeted verification**

Run: `npm run test:ci -- src/__tests__/lib/chat/sse.test.ts src/__tests__/lib/chat/llm-stream.test.ts src/__tests__/lib/ai-config.test.ts`

- [ ] **Step 2: Run lint on changed files**

Run: `npm run lint -- src/app/api/chat/route.ts src/components/chat/chat-interface.tsx src/lib/chat/sse.ts src/lib/chat/llm-stream.ts src/__tests__/lib/chat/sse.test.ts src/__tests__/lib/chat/llm-stream.test.ts`

- [ ] **Step 3: Manual smoke check**

Send a chat prompt and confirm tokens render incrementally in the UI, no 504 for normal request sizes, and session/source metadata still appears.
