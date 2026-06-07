# Chat SSE Streaming Plan

Status: historical implementation record.

## Goal

Stream AI chat responses token-by-token over Server-Sent Events from `POST /api/chat` while preserving the non-stream response path.

## Scope

- Add SSE frame/encoding utilities.
- Add provider streaming helper.
- Support stream mode in `/api/chat`.
- Persist completed user and assistant messages after streaming.
- Update the chat client to read SSE from a POST response.
- Preserve graceful fallback for non-streaming provider paths.

## Key Files

| Area | Files |
|---|---|
| API | `src/app/api/chat/route.ts` |
| Streaming utilities | `src/lib/chat/*stream*`, SSE parsing helpers |
| Client | chat stream hook and chat interface |
| Persistence | chat session/message helpers |
| Tests | SSE utility, stream parsing, chat hook tests |

## Verification

- Streaming sends metadata, tokens, done, and error frames correctly.
- Client appends tokens in order.
- Interrupted or failed streams leave the UI in a recoverable state.
- Non-stream chat still works.
- Persisted session reload shows the final assistant response.
