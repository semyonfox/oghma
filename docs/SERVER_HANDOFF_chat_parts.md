# Server handoff — chat message parts (tool-call persistence)

Audience: agent / operator on the deploy server. The author has no SSH access
right now, so anything that can't ride the normal CI/CD path is flagged below.

## What changed

Assistant chat messages used to be stored as a single `content` string. Tool
call indicators were injected as inline markdown (`*Searching notes…*`) on the
client only and were lost on reload. We've moved to the OpenAI / Anthropic
"typed parts" shape:

```jsonc
// app.chat_messages.parts (jsonb, NOT NULL, default '[]')
[
  { "type": "text", "text": "looking now." },
  { "type": "tool", "name": "getChunks", "label": "Searching notes" },
  { "type": "text", "text": "found three." }
]
```

`content` stays as the canonical plain-text concat (drives the copy button,
LLM history feed, search indexing). `parts` is the structured representation
the renderer walks. Tool indicators now persist across reloads and are styled
by a real React component (`ToolCallPill`) rather than markdown injection.

## Goals

1. The new SQL migration applies cleanly during the next Amplify build.
2. After deploy, new assistant messages persist `parts` and reload renders
   tool pills inline. Legacy rows continue to render as plain text.
3. No manual data fix-ups, no out-of-band scripts, no service restarts.

## Migration

`database/migrations/020_chat_message_parts.sql` — auto-applies via
`amplify.yml → npm run migrate → scripts/prebuild-migrate.mjs` before env
vars are unset, using the `oghmanotes/migrator` Secrets Manager creds. Steps
the migration runs:

1. `ALTER TABLE app.chat_messages ADD COLUMN IF NOT EXISTS parts JSONB;`
2. Backfill existing rows: `parts = [{type:"text", text:content}]` for any
   row where `parts IS NULL`. Idempotent — only touches null rows, safe to
   re-run.
3. `ALTER COLUMN parts SET DEFAULT '[]'::jsonb` then `SET NOT NULL`.

Tracked in `app.schema_migrations` as version `020`. Sequential numbering
continues from the existing 018, 019.

### Sizing note

The backfill `UPDATE` rewrites every existing row in `app.chat_messages`. On a
big table this can be slow / lock-contending. At the time of writing the table
is small (student-side notes app, low volume), so a single in-build UPDATE is
fine. If row count has grown materially since then, run the migration manually
in chunks first and let the in-build re-run no-op.

## Files touched

Schema:
- `database/migrations/020_chat_message_parts.sql` (new)

Server:
- `src/app/api/chat/route.ts` — streaming branch accumulates `MessagePart[]`
  alongside `reply`, passes to `persistMessage`. Non-streaming and fallback
  paths use the default single-text-part wrapping.
- `src/app/api/chat/sessions/[id]/route.ts` — GET now selects `m.parts`.
- `src/lib/chat/session.ts` — `persistMessage` signature: optional
  `{ parts, sources }` options; defaults to `[{type:"text", text:content}]`.
- `src/lib/chat/tool-labels.ts` (new) — `TOOL_CALL_LABELS`, `humanizeToolName`,
  `labelForTool`. Shared by server (route) + client (parse-sse-frame).
- `src/lib/chat/parse-sse-frame.ts` — re-exports from tool-labels, uses
  `labelForTool` instead of the inline lookup.

Types:
- `src/lib/chat/types.ts` — `MessagePart` discriminated union, optional
  `parts` field on `Message`, `normalizeMessageParts(value: unknown)` for
  hydration.
- `src/components/chat/chat-interface.tsx` — re-exports `MessagePart`.

Client:
- `src/lib/chat/hooks/use-chat-stream.ts` — `applyUpdate` builds
  `parts` immutably from `token` and `tool-call` events. `content` keeps
  its existing plain-prose semantics.
- `src/lib/chat/hooks/use-chat-persistence.ts` — session restore
  hydrates `parts` from the GET response (with `normalizeMessageParts`
  fallback to a single text wrapper for legacy rows).
- `src/components/chat/tool-call-pill.tsx` (new) — small bordered
  italic pill, matches `ThinkingBlock`'s muted register.
- `src/components/chat/message-bubble.tsx` — new `AssistantBody`
  helper walks `parts` (text → `ChatMarkdown`, tool → `ToolCallPill`),
  falls back to whole-content markdown for legacy/draft messages.

Tests added/updated:
- `src/__tests__/lib/chat/use-chat-stream.test.ts` — token/tool/text
  interleaving, back-to-back tools, parts after a tool call.
- `src/__tests__/lib/chat/parse-sse-frame.test.ts` — friendly + humanized
  labels, malformed payloads.
- `src/__tests__/lib/chat/types.test.ts` — `normalizeMessageParts` happy
  + malformed paths.

## Verification on the server

After the next Amplify build / runtime swap:

```sql
-- 1. confirm migration applied
SELECT version, name, applied_at
  FROM app.schema_migrations
 WHERE version = '020';

-- 2. confirm column exists with the expected default + NOT NULL
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema='app' AND table_name='chat_messages' AND column_name='parts';

-- 3. confirm backfill ran (no NULL parts)
SELECT COUNT(*) FROM app.chat_messages WHERE parts IS NULL;
-- expected: 0

-- 4. spot-check a recent assistant row written post-deploy — should have
--    real typed parts, not just a single text wrapper
SELECT id, role, parts
  FROM app.chat_messages
 WHERE role = 'assistant' AND created_at > NOW() - INTERVAL '1 hour'
 ORDER BY created_at DESC
 LIMIT 5;
```

Smoke-test in the UI:

1. Start a new chat that triggers a tool call (e.g. ask the assistant to find
   notes on a topic — that fires `getChunks`).
2. Live: tool pill renders inline, prose continues after.
3. Reload the page (or open the session from the side list). The pill
   survives the reload — no `*Searching notes…*` markdown leak.
4. Old sessions still render as plain prose (backfilled to single text part).

## Things this handoff does NOT cover

- No auth/permission changes.
- No new env vars or secrets.
- No queue/worker/Lambda code touched.
- No client bundle env vars to inline.
- LLM history feed is unchanged shape (assistant messages still come back as
  plain `content` strings to the model — `parts` is purely a UI concern on
  the read side; the model never sees the structured array).

If anything in `app.schema_migrations` looks off after build, the most likely
culprit is the `ALTER COLUMN ... SET NOT NULL` failing because the backfill
`UPDATE` didn't cover a row written between the `ADD COLUMN` and `UPDATE`
(unlikely with normal traffic but possible). Re-running the migration is
safe — every step is `IF NOT EXISTS` / idempotent.
