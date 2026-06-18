# Delete Account Grace Period Plan

Status: historical implementation record.

## Goal

Replace immediate hard deletion with a GDPR-aligned soft-delete grace period, account recovery, and scheduled cleanup.

## Scope

- Extract hard-deletion cleanup logic into a shared helper.
- Change delete-account route to set `deleted_at` / inactive state.
- Add cancel-deletion recovery endpoint.
- Add admin cleanup endpoint or scheduled cleanup path for expired deletions.
- Ensure login rejects soft-deleted accounts.
- Keep final deletion idempotent and dependency-aware.

## Key Files

| Area | Files |
|---|---|
| Auth API | `src/app/api/auth/delete-account/route.ts`, cancel deletion route |
| Cleanup | `src/lib/auth/account-deletion.ts`, note cleanup helpers |
| Admin/cron | cleanup-deleted-accounts endpoint or script |
| Login | credentials login route |

## Verification

- Deleting an account prevents login immediately.
- Recovery within the grace period restores access.
- Expired soft-deleted accounts can be permanently removed.
- Cleanup removes dependent notes, files, sessions, and user-owned data safely.
