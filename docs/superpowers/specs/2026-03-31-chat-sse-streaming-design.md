# Chat SSE Streaming Spec

Status: historical design record.

## Intent

Let chat responses stream over SSE from a POST request so users see tokens and tool events as they happen.

## Decisions

- Keep the existing non-streaming response contract.
- Add stream mode to `/api/chat`.
- Use SSE events for metadata, tokens, completion, errors, and tool calls.
- Persist final messages after streaming completes.
- Keep legacy clients compatible.

## Client Behavior

- Append token events in order.
- Show errors without losing the draft conversation.
- Rehydrate persisted messages on reload.

## Verification

- Stream and non-stream paths both work.
- Malformed frames do not crash the client.
- Persisted streamed messages reload correctly.
