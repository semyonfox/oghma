# Vault Jobs Hardening Plan

Status: historical implementation record.

## Goal

Close reliability gaps in vault import/export: portable email config, safer retries, progress tracking, conflict handling, cancellation, RAG opt-out, and cleanup of failed partial imports.

## Scope

- Make email transport configurable beyond AWS SES.
- Add safer queue retry/backoff once workers are idempotent enough for it.
- Persist export/import progress with `processed_files`.
- Return `409` for active job conflicts unless the caller forces replacement.
- Add cooperative job cancellation.
- Add `skipRAG` import option for faster raw imports.
- Clean up orphaned partial data from failed/cancelled imports.
- Add API tests for conflict, cancellation, status shape, and import options.

## Key Files

| Area | Files |
|---|---|
| Email | `src/lib/email.js` |
| Queue | `src/lib/queue.ts` |
| Migration | `database/migrations/029_vault_progress_and_cancel.sql` |
| Workers | `src/lib/vault/import-worker.js`, `src/lib/vault/export-worker.js` |
| APIs | `src/app/api/vault/*` |
| UI | `src/components/settings/data-export-section.jsx` |
| Tests | vault API/status/cancel/import/export tests |

## Verification

- Status returns useful `processed_files` progress.
- Cancelled jobs stop between files and end in `cancelled`.
- Starting a second active job gets `409` unless explicitly forced.
- Forced replacement cancels the older job safely.
- Failed imports do not leave inaccessible orphaned notes/files.
- Queue retries do not duplicate completed work.
