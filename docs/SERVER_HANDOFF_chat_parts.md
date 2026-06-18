# Server Handoff: Chat Message Parts

Status: implemented through `database/migrations/028_chat_message_parts.sql`.

## What Changed

Assistant chat messages now store structured UI parts as `app.chat_messages.parts` while keeping `content` as the canonical plain-text string for copy, history, and search.

Example shape:

```json
[
  { "type": "text", "text": "Looking now." },
  { "type": "tool", "name": "getChunks", "label": "Searching notes" },
  { "type": "text", "text": "Found three relevant notes." }
]
```

Tool-call pills now persist across reloads instead of being injected as transient markdown.

## Migration

`028_chat_message_parts.sql`:

1. Adds `parts JSONB`.
2. Backfills existing rows with a single text part wrapping `content`.
3. Sets default `[]::jsonb`.
4. Sets `NOT NULL`.

The migration is idempotent and is tracked in `app.schema_migrations` as version `028`.

## Files Involved

| Area | Files |
|---|---|
| Migration | `database/migrations/028_chat_message_parts.sql` |
| Server persistence | `src/lib/chat/session.ts`, `src/app/api/chat/route.ts`, `src/app/api/chat/sessions/[id]/route.ts` |
| Shared types/labels | `src/lib/chat/types.ts`, `src/lib/chat/tool-labels.ts`, `src/lib/chat/parse-sse-frame.ts` |
| Client streaming/restore | `src/lib/chat/hooks/use-chat-stream.ts`, `src/lib/chat/hooks/use-chat-persistence.ts` |
| Rendering | `src/components/chat/message-bubble.tsx`, `src/components/chat/tool-call-pill.tsx` |
| Tests | chat stream, SSE frame parsing, and message part normalization tests |

## Server Verification

```sql
SELECT version, name, applied_at
  FROM app.schema_migrations
 WHERE version = '028';

SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'app'
   AND table_name = 'chat_messages'
   AND column_name = 'parts';

SELECT COUNT(*)
  FROM app.chat_messages
 WHERE parts IS NULL;
```

Expected: migration row exists, `parts` is non-null JSONB with default `[]`, and null count is `0`.

## UI Smoke Test

1. Start a chat that triggers note search/tool use.
2. Confirm the live tool pill appears inline.
3. Reload the session.
4. Confirm the tool pill still appears and old sessions still render as plain prose.

## Notes

- No auth or permission changes.
- No new env vars.
- `content` remains what the model history sees; `parts` is for UI rendering.
- On the current homelab stack, the migration runs through Jenkins via `scripts/prebuild-migrate.mjs`.
