# Chat map

> Current code map, verified 2026-09-13.

Chat accepts a message, resolves its scope, and either responds inline
or creates a durable background generation. PostgreSQL owns sessions, messages,
generation state, and final answers. Redis carries queue traffic, short-lived
replay events, presence, and cancellation state.

## Entry points and ownership

- [`/api/chat`](../../app/api/chat/route.ts) validates requests, applies rate
  limits, normalizes scope, and chooses inline or background delivery.
- [`generation-store.ts`](generation-store.ts) owns durable generation claims,
  state changes, replay-event retention, and cancellation flags.
- [`generate-background.ts`](generate-background.ts) processes a claimed
  background generation. [`prepare-generation.ts`](prepare-generation.ts)
  builds retrieval and prompt inputs, while [`build-stream.ts`](build-stream.ts)
  configures the model and tools.
- [`routes.ts`](routes.ts), [`session.ts`](session.ts), and [`sse.ts`](sse.ts)
  support session APIs and reconnectable delivery. [`hooks/`](hooks/) owns
  browser persistence and streaming state.
- [`../canvas/worker-entry.ts`](../canvas/worker-entry.ts) consumes the
  BullMQ-only `chat-generation` queue as part of the shared Node worker.

## Tests and runbooks

- Route and worker contracts are in
  [`chat-request-contract.test.ts`](../../__tests__/api/chat-request-contract.test.ts),
  [`chat-generation-stream.test.ts`](../../__tests__/api/chat-generation-stream.test.ts),
  and [`generate-background.test.ts`](../../__tests__/lib/chat/generate-background.test.ts).
- [`chat-generation.spec.ts`](../../../tests/e2e/smoke/chat-generation.spec.ts)
  checks the background browser path. [`chat.spec.ts`](../../../tests/e2e/smoke/chat.spec.ts)
  covers chat in the smoke suite.
- [Chat operations](../../../docs/operations/chat.md) owns readiness,
  diagnosis, and release checks. [Testing and verification](../../../docs/engineering/testing.md)
  owns the local and CI commands.
