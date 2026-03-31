# Chat SSE Streaming Design

Date: 2026-03-31
Status: approved in conversation, pending final spec review

## Goal

Reduce perceived latency in AI chat by streaming assistant output token-by-token to the UI instead of waiting for full completion.

## Scope

- Keep the existing `POST /api/chat` endpoint.
- Add streaming mode behind a request flag.
- Keep non-stream JSON behavior for compatibility.
- Persist assistant response once at stream completion.

Out of scope:

- Resume mid-response after refresh.
- Streaming persistence checkpoints.
- New endpoint paths.

## API Contract

Request body (existing + new field):

- `message: string`
- `noteId?: string`
- `sessionId?: string`
- `history?: { role: "user" | "assistant" | "system"; content: string }[]`
- `stream?: boolean` (default `false`)

Behavior:

- `stream !== true`: unchanged JSON response.
- `stream === true`: respond with `Content-Type: text/event-stream`.

SSE event types:

- `meta`: `{ sessionId, sources, ragAvailable, llmAvailable }`
- `token`: `{ text }`
- `done`: `{}`
- `error`: `{ message, traceId? }`

## Server Design

### Route-level flow

1. Validate session and rate limit.
2. Parse request body and validate message length.
3. Resolve/create chat session.
4. Persist user message immediately.
5. Run RAG pipeline (embed + search + rerank), with existing graceful fallback behavior.
6. Branch by mode:
   - non-stream: current full-response flow.
   - stream: SSE flow to client and completion-time persistence.

### Streaming flow

1. Open SSE response stream.
2. Emit `meta` early once session and sources are known.
3. Call Kimi `chat/completions` with `stream: true`.
4. Parse upstream provider SSE deltas.
5. For each text delta, emit `token` and append to in-memory assistant buffer.
6. On upstream completion:
   - persist final assistant buffer once to `app.chat_messages`
   - emit `done`
   - close stream.

### Error behavior

- If failure occurs before first token, emit `error` and close.
- If failure occurs mid-stream, emit `error` and close.
- Mid-stream failure does not persist partial assistant text.
- Existing timeout caps from `ai-config` remain in effect.

## Client Design

File: `src/components/chat/chat-interface.tsx`

- Send `stream: true` in chat POST body.
- Use `fetch` + `ReadableStream` parsing (POST-compatible) instead of `EventSource`.
- Create assistant placeholder message immediately after send.
- Update placeholder content progressively as `token` events arrive.
- On `meta`, update session info and sources.
- On `done`, finalize UI state (`loading = false`).
- On `error`, surface message and keep partial rendered text if any.

## Compatibility and Rollout

- Default request behavior remains non-stream unless client asks for stream.
- Existing callers that do not send `stream` are unaffected.
- If upstream/provider stream fails, the client receives a terminal `error` event.

## Testing Strategy

1. Unit tests for SSE framing/parsing helpers.
2. API test for stream mode event ordering (`meta -> token* -> done`).
3. Client test for incremental message rendering with chunked input.
4. Regression test to confirm current JSON mode shape is unchanged.

## Risks and Mitigations

- Provider SSE format variation:
  - Mitigation: robust parser with ignored unknown chunks and explicit done detection.
- UI parser complexity:
  - Mitigation: isolate parser helper and test edge cases (split boundaries, partial lines).
- Stream leak/hanging connection:
  - Mitigation: always close stream on done/error, enforce timeout and abort handling.

## Implementation Notes

- Keep shared chat logic centralized to avoid divergence between stream and non-stream paths.
- Keep persistence semantics unchanged except assistant message timing in stream mode.
- Preserve existing trace/metrics calls where possible; add stream-specific timing if cheap.
