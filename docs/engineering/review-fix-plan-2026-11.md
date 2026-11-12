# Review and security fix plan, November 2026

> **Status:** Target (plan), implemented on branch `fix/review-2026-11` and not yet merged. Written 2026-11-12 from a review of `049cc6b2` (origin/dev). Move it to `docs/history/` once the work lands.
>
> **Source of truth for:** what the November 2026 review found, what the fix branch takes, and what it leaves for later

## How this was produced

Three read-only reviews ran in parallel, each in its own worktree and without seeing the others' output:

- **Two blind code reviews** with the same brief: logic and data-loss bugs, AI cost and context leaks, claims the code doesn't back, and redundant layers or empty tests. One reviewer was GPT-6.1 Sol and the other was Claude Fable 5.2.
- **One authorisation and data-exposure review**, by DeepSeek V4.1 Flash. It produced an access matrix of actor against data path.
- **A validation pass** on the DeepSeek review. GLM-5.3-Flash was meant to run it, but both attempts hit OpenCode's free usage limit, so the lead reviewer ran it instead. The results are in [Security validation](#security-validation).

Every claim below was checked against the code before it went in. A finding that didn't hold up is listed under [Dropped or corrected](#dropped-or-corrected).

## Findings taken

Severity is the merged judgement, not any one reviewer's. "Seen by" shows which reviewers raised each finding: Sol (S), Fable (F), DeepSeek (D) and GLM (G).

### A. The note save fence (data loss)

The editor sends `expectedUpdatedAt` with every save, and the server returns 409 when that value no longer matches the row. The fence goes wrong in both directions. It reports conflicts that don't exist, and it lets a stale body through with a fresh stamp.

| ID | Severity | Seen by | Finding | Evidence |
|---|---|---|---|---|
| A1 | High | S, F | **Reindexing moves the fence.** The reindex worker writes `extracted_text`, and `update_notes_updated_at_trigger` then bumps `updated_at` on that write. The editor's next save carries the older stamp and gets a 409. Autosave pauses and the "saved elsewhere" toast appears, even though only one person touched the note. This happens in any editing session that runs more than about 15 s (`NOTE_REINDEX_DELAY_MS`) past a save. It has been live since #696 (`bb2f7a81`), which fixed the reindex stamp match. Before that fix, the stamp never matched, so the reindex `UPDATE` never ran. | `src/lib/rag/note-reindex.ts:61-69`, `scripts/e2e/baseline-schema.ts:270-281`, migration `085` lines 14-16 (which says this directly), `src/app/api/notes/[id]/route.ts:158-164`. Fable reproduced it on pglite with the repo's SQL. |
| A2 | High | S, F | **A stale body is sent with a fresh stamp after load.** The editor shows the cached IndexedDB copy, and the user types before the GET returns. The load then adopts the server's `updatedAt` but keeps the edited old body, so the next autosave overwrites newer text from another device without a conflict. A restored draft goes the same way: the editor adopts the fresh stamp and shows only a 6 s warning toast. When the fetch fails and the cached copy is shown, the save carries no stamp at all, which makes it last-write-wins. | `src/components/editor/markdown-editor.tsx:210-221, 257-294, 362-367`, `src/lib/notes/draft-cache.ts:22-26`. Sol and Fable both reproduced the transition. |
| A3 | High | S | **A dirty split pane adopts the other pane's stamp.** The `note-content-sync` handler always takes `updatedAt`, but it takes the body only when the pane is clean. The dirty pane's next autosave then overwrites the other pane's save. | `markdown-editor.tsx:324-333`, `src/lib/notes/state/note.ts:276-283`. Sol reproduced this with the real handler. |
| A4 | Medium | F | **A real conflict is lifted by the next blur, and the "discard" option in the toast doesn't exist.** `handleSave` clears `conflictRef` for every caller, including blur, so clicking the sidebar overwrites the other version. The toast says "save to overwrite, or discard", but there is no discard action. | `markdown-editor.tsx:414-427` and `469-475`. The toast text is at lines `280` and `384`. |

The editor has no note version history, so an overwritten body can't be recovered.

### B. Search-index handoff

| ID | Severity | Seen by | Finding | Evidence |
|---|---|---|---|---|
| B1 | Medium | S | **A lost reindex publish leaves the note's index stale indefinitely.** The PUT commits, `enqueueNoteReindexJob` throws, and the error is logged and swallowed. No worker recovery pass covers note reindexing, and saving the same text again doesn't enqueue. | `src/app/api/notes/[id]/route.ts:194-207`, `src/lib/canvas/worker-entry.ts:174-184` |
| B2 | Medium-low | F | **Two kinds of new note never get indexed.** `POST /api/notes` with content (which Duplicate uses) never enqueues a reindex. `makeMDNote` (an approved chat action) writes `extracted_text` inside the transaction, then embeds inline after the commit. If that embed fails, the note exists but the action reports failure, and every later reindex returns `unchanged`. | `src/app/api/notes/route.ts:117-147`, `src/lib/chat/build-stream.ts:292-326`, `src/app/api/chat/actions/[id]/route.ts:123-130` |

### C. AI cost

| ID | Severity | Seen by | Finding | Evidence |
|---|---|---|---|---|
| C1 | Medium | F, D | **One "Start review" can fire about 125 LLM calls, and the route has no rate limit.** The route schedules up to 25 random uncovered chunks and returns 202 while no cards exist. The client retries 5 times, 3 s apart. `ORDER BY random()` picks a different 25 each time, so the in-flight guard, which works per chunk, doesn't stop the spend. Each call uses the global output cap and reasoning effort, with `maxRetries: 3`. | `src/app/api/quiz/sessions/route.ts:26-58, 84-101`, `src/components/quiz/quiz-dashboard.tsx:148-180`, `src/lib/quiz/generate-background.ts:59-74`, `src/lib/quiz/generate.ts:226-246`. Fable measured 122 calls. |

### D. Authorisation and sessions

| ID | Severity | Seen by | Finding | Evidence |
|---|---|---|---|---|
| D1 | Medium | D | **Logging out doesn't revoke the session.** Logout clears the cookies, but the JWT stays valid until it expires, which is 30 days with "remember me". The only way to revoke every device is a `session_version` bump, and today nothing the user can trigger does that apart from a password reset or deleting the account. | `src/app/api/auth/logout/route.ts:1-2`, `src/app/api/auth/login/route.ts:86`, `src/lib/auth/session.ts:119-156` |

GLM's results, including new rows, are in [Security validation](#security-validation).

### E. Claims the code doesn't back, and dead layers

| ID | Severity | Seen by | Finding | Evidence |
|---|---|---|---|---|
| E1 | Low | F | The in-app guide is chat's "source of truth" and the starter note. It tells users to start a Canvas content import, but that route returns 403 unless `CANVAS_CONTENT_IMPORT=on`. | `src/lib/chat/app-guide.ts:45-46, 69-77`, `src/lib/canvas/content-policy.ts:6-8` |
| E2 | Low | F | The `content-policy.ts` comment says Canvas content "stays out of notes and ai" while the switch is off. That's only true for new imports and the Canvas tools. Canvas notes imported earlier still feed retrieval and quizzes. | `src/lib/canvas/content-policy.ts:3-5` |
| E3 | Low | F | Three claims are stale. The `generate-background.ts` comment says the guard stops retries paying twice, which C1 shows is false. The notes README says `notes.test.ts` "covers the rename/autosave race", but that test asserts SQL text against a mock. The syntax guide says "Synced with S3 storage", but note bodies live in PostgreSQL. | `src/lib/quiz/generate-background.ts:59-62`, `src/lib/notes/README.md`, `src/app/syntax-guide/syntax-guide-content.tsx:155` |
| E4 | Low | F | **Dead cache layer.** Nothing writes `tree:children`, `tree:full`, `note` or `notes:list`, and `cacheSet` is only called for settings. Eight `cacheInvalidate` calls delete keys that can't exist. | `src/lib/cache.ts:45-53`, `src/lib/notes/tree-cache.ts`, `rg "cacheInvalidate\("` |
| E5 | Low | F | Chat's `renameNote` `UPDATE` doesn't filter `deleted_at IS NULL`. | `src/lib/chat/build-stream.ts` (renameNote) |
| E6 | Low | F | The tests couldn't have caught A1 to A4. The editor tests mock `fetchNote` and `mutateNote` and never assert which stamp goes out with which body. `notes.test.ts` is `@ts-nocheck`, accepts any SQL, and mocks `addNoteToTree` and `removeNoteFromTree`, which no longer exist. `note-reindex-stamp.test.ts` checks the stamp but not that the client's stamp survives. | as listed |

## Fix order and design constraints

These items ship on one branch, `fix/review-2026-11`, cut from this branch.

1. **A1, the fence trigger, in a new migration (`086`).** Replace the notes trigger function. An update that changes only derived columns must keep `updated_at`: today that's `extracted_text`, plus the B1 marker column. Every other change keeps today's behaviour, and so does a statement that sets `updated_at` itself. Before choosing the derived set, find every reader that relies on `updated_at` moving after extraction or indexing: the offline reader, tree refresh, sync and imports. List what you found in the PR. Add an integration test on the e2e database: PUT, then `reindexNote`, then a PUT with the first stamp must return 200, and a real intervening content save must still return 409.
2. **A2 to A4, the editor fence, all in one change to `markdown-editor.tsx` and its helpers.** The rules:
   - **The stamp travels with the body it describes.** Keep the server body and stamp that the on-screen text was derived from (`baseContent` and `baseUpdatedAt`). A fetched or broadcast stamp may be adopted only in three cases. The editor adopts that body, the broadcast body equals `baseContent` (a metadata-only save), or the broadcast is this editor's own save.
   - **The store dispatches `note-content-sync` synchronously inside `mutateNote`**, so the saving pane receives its own event before `persistNote` resumes. The handler must recognise its own in-flight save. Test that a pane which keeps typing during its own save doesn't flag a conflict.
   - **The cached copy uses its stored stamp.** `noteCache` already stores `updatedAt`, so read it with the content. `NoteDraft` gains `baseUpdatedAt`. Older drafts without it are treated as conflicts if the server body differs.
   - **When the fresh server body differs from both the base and the local text, enter conflict.** Autosave and blur must not save. Only Save or Ctrl+S ("keep mine") overwrites, and a new "Load theirs" action clears the draft and adopts the server body. Add i18n keys by hand or with `translate-locales.ts`, never with an extract script.
   - **Tests** are component tests that assert the exact `{content, expectedUpdatedAt}` sent in each of these scenarios: Sol's split-pane case, the cached copy edited early, an old draft, an offline open, and blur during a conflict.
3. **B1 and B2, the durable reindex handoff.** Add the column `app.notes.reindex_requested_at timestamptz` in migration `086`, and set it in the same transaction as every content-changing write: PUT, create with content, and `makeMDNote`. The reindex clears it when its stamp matches, on both the `indexed` and `unchanged` outcomes. Add a bounded worker recovery pass, for example 100 notes per run older than 2 minutes, that re-enqueues. `makeMDNote` stops embedding inline and enqueues instead. The approved action then succeeds as soon as the note row exists.
4. **C1, quiz spend.**
   - Schedule only `maxQuestions` minus the cards already available, capped at 25.
   - Schedule nothing while a batch for the same user is in flight in this process.
   - Add a per-user `quiz-session` rule to `rate-limit-config.ts`, sized for the client's 5 retries per start.
   - Add a per-user `study-map-jobs` rule to `POST /api/study-maps/[id]/jobs`.
5. **D1, sign out everywhere.** `POST /api/auth/logout` with `{ "everywhere": true }` bumps `session_version` for the signed-in user and clears the cookies. Add a button in Settings. Check that mobile grants are revoked too: the mobile exchange compares `session_version`. A plain logout keeps today's behaviour, so other devices stay signed in.
6. **D2.** `resolveSession` stores `noteId` only when that note belongs to the user.
7. **E1 to E5, small truth fixes.** Show the Canvas steps in the guide only when content import is on. Otherwise say deadlines still sync. Fix the comments and copy, delete the dead cache keys and `tree-cache.ts`, and add `deleted_at IS NULL` to chat rename.
8. **Access-matrix tests.** Add `tests/integration/security/access-matrix.test.ts` on the e2e database, using the existing integration pattern: real Postgres, `requireAuth` mocked per actor. Seed two users with a note, a folder, an attachment row, a chat session, a quiz session, a PDF annotation, a study map and a calendar token. For every row in [Access matrix](#access-matrix), run each actor (owner, other user, anonymous) against the real route handler. Assert the status, and that the response body never contains the other user's ids or text. Admin, worker and AI-model cells, where the route has them, are covered in the same file through their library entry points. A table drives the tests, so adding a route means adding a row.

**Not in scope:** dependency upgrades, unrelated refactors, removing `@ts-nocheck` from `notes.test.ts` (only the dead mocks go), and any change to production data.

## Deferred, with reasons

On 2026-11-12 six of the eight first-pass deferrals were pulled into the branch. They're listed under [Taken after review](#taken-after-review). Two remain on the long finger:

| Item | Seen by | Why it waits |
|---|---|---|
| Note version history | F | It's a product feature. The fence fixes close the known overwrite paths without it. |
| The embedding fallback model isn't enforced to match the primary | F | The env template keeps them the same. Add a startup check when a second model is actually configured. |

### Taken after review

- **Quiz failure memory and output ceiling.**
  - Migration `087` adds `app.chunks.quiz_generation_failures`.
  - A model skip counts two strikes and an unparseable reply counts one.
  - Two strikes take the chunk out of the uncovered pool. Re-chunking a note resets it, because chunk rows are replaced.
  - Truncated replies and provider errors don't count.
  - Quiz calls have their own `maxOutputTokens` of 4,096 and `medium` reasoning, instead of the chat defaults of 8,192 at `high`. Every call logs input, output and reasoning tokens with its finish reason, so the ceiling can be tuned from evidence. If question quality drops, raise `QUIZ_REASONING_EFFORT` in `src/lib/quiz/generate.ts`.
- **Login lockout.**
  - The five-strike, 30-minute lock is now scoped to the email and client IP, so someone guessing from one address can't lock the owner out everywhere.
  - A per-email backstop of 20 attempts per window still bounds a guesser spread across many addresses.
  - The client IP comes from `X-Forwarded-For`, which the homelab nginx sets from `CF-Connecting-IP`.
- **`/agent/identity`.**
  - An existing account now gets the same 201 claim as a new address. Completion only accepts an account created after the claim, so the claim simply expires.
  - The public OpenAPI document no longer lists an existing-account 409 there. It also no longer lists the register 409, which the register route never returned.
- **Session JWT `aud` and `iss`.**
  - New session tokens carry `aud: oghma-session` and `iss: oghmanotes`, and a token for another audience is rejected.
  - Tokens from before this change carry neither, and they're accepted until 2027-01-31 so the deploy signs nobody out.
  - After that date, delete the transition branch in `verifyJWTToken`. If the branch deploys after 2026-12-31, anyone still holding an old token is asked to sign in again.
- **Canvas chat tool results.** These are capped at 20,000 characters, the same ceiling as `readNote`. The cut is reported to the model so it asks for less. The schema payload that rides on every step wasn't measured or changed.
- **Chat note actions.** Approving `makeMDNote`, `renameNote` or `moveNote` now publishes a tree invalidation to other tabs and refreshes this tab's tree.

## Dropped or corrected

| Claim | Reviewer | What the code shows |
|---|---|---|
| Quiz retries pay for the *same* chunks several times | D | `generateBatch` already claims chunks in process (`generate-background.ts:59-74`). The real problem is that each retry picks *different* random chunks, which is C1. |
| The Canvas token key is "derived from `user_id`" | D | It's PBKDF2 over `SERVER_ENCRYPTION_SECRET` with `user_id` as the salt (`src/lib/crypto.ts:19-35`). The protection holds. Only the description was loose. |

## Security validation

The GLM-5.3-Flash validation was started twice, and both runs stopped within seconds on OpenCode's free usage limit without doing any work. The lead reviewer, Claude Opus 5.5, ran the same validation brief by hand instead.

**DeepSeek's findings:**
- **Confirmed:** F1, F3, F4 and F5.
- **Half wrong:** F2. See [Dropped or corrected](#dropped-or-corrected).

**Its "verified clean" list:** all confirmed:
- There are no `'use server'` modules and no `unstable_cache` or `'use cache'`.
- Only non-secret `NEXT_PUBLIC_*` variables appear in client code.
- The settings schema strips unknown keys, so `avatarKey` can't be injected.
- Avatar keys come from the server.
- Chat's markdown variant turns remote images into links. Injected content can't exfiltrate through an auto-loading image.
- Write tools default to stored proposals (`src/lib/chat/actions.ts`). Only an allowlisted set of read-only local tools and GET-only Canvas tools run without approval.

**Paths the matrix missed, all checked:**

| Path | Result |
|---|---|
| Assignment Canvas view and submit, assignment materials | Enforced. `loadCanvasAssignment` scopes the assignment row to the user and uses that user's credentials (`src/lib/canvas/load-assignment.ts:7-13`). |
| Chat generation stream and cancel | Enforced through `loadOwnedChatGeneration(id, user_id)`. |
| Quiz cards, related questions, answers | Enforced. Every query carries the user id. |
| Note backlinks, path, offline copy | Enforced. |
| Note assets from the shared import cache | Enforced through the caller's own note row (`assets/route.ts:31-35`). The cache itself is shared on purpose. |
| Admin analytics page | Enforced. A verified session plus the `ANALYTICS_ADMIN_EMAILS` allowlist, applied on the server. |
| Share links | None exist. The `notes.shared` column is selected but nothing sets or serves it. |
| Chat session `note_id` | **Not checked on write** (`src/lib/chat/session.ts:294-300`). A user can store another user's note id on their own session. Nothing leaks, because both readers join notes on `n.user_id = s.user_id`. Fix in D2 so the guarantee doesn't rest on every future reader. |
| Study-map jobs | **No rate limit.** An explicit-note job always enqueues a paid classification, capped only at 100 active jobs per user (`src/lib/study-map/jobs.ts:163-180`). Folded into C1. |

**Observed, out of scope:** the CSP allows `'unsafe-inline'` and `'unsafe-eval'` scripts (`next.config.mjs:57`), which weakens it as an XSS backstop. That's a separate hardening task.

### D2 (added from validation)

| ID | Severity | Seen by | Finding | Evidence |
|---|---|---|---|---|
| D2 | Low | lead | `resolveSession` stores a client-supplied `noteId` without checking ownership. Store `null` unless the note belongs to the user. | `src/lib/chat/session.ts:294-300` |

C1 also adds a per-user rate limit to `POST /api/study-maps/[id]/jobs`.

## Access matrix

Actors: **owner** (O), **other signed-in user** (X), **anonymous** (A). **Before** is the enforcement found at `049cc6b2`, either enforced in code (E) or assumed (As). **After** is what `tests/integration/security/access-matrix.test.ts` asserts against real Postgres. Where nothing else is noted, it asserts 401 for A, 404 for X with no foreign ids or text in the body, and 2xx for O.

| Data path | O | X | A | Before | After |
|---|---|---|---|---|---|
| Notes list and create | 2xx | only own rows | 401 | E | asserted |
| Note read, update, delete | 2xx | 404 | 401 | E | asserted |
| Note backlinks, path, offline copy | 2xx | 404 | 401 | E | asserted |
| Note assets and attachments | 2xx | 404 | 401 | E | asserted |
| Tree read and move (move into the other user's folder) | 2xx | 404 | 401 | E | asserted |
| Trash list, restore, empty | 2xx | no effect on the other user | 401 | E | asserted |
| Upload attachment to a note | 2xx | 404 | 401 | E | asserted |
| PDF annotations | 2xx | 404 | 401 | E | asserted |
| Search and global search | own hits | never the other user's text | 401 | E | asserted |
| Vector retrieval through `hydrateOwnedNoteChunks` | own chunks | foreign chunk ids dropped | n/a | E | asserted with seeded foreign chunk ids |
| Chat sessions, messages, generations (stream, cancel) | 2xx | 404 | 401 | E | asserted |
| Chat session `note_id` on create | stored | **As (stored unchecked)** | 401 | As | asserted `null` for a foreign note (D2) |
| Chat tool action approve | 2xx | 404 | 401 | E | asserted |
| Chat read tools (`readNote`, `getChunks`) | own | foreign ids return nothing | n/a | E | asserted through the tool entry points |
| Quiz sessions, answers, cards | 2xx | 404 | 401 | E | asserted |
| Study maps and jobs | 2xx | 404 | 401 | E | asserted, plus the rate limit (C1) |
| Assignments and time blocks | 2xx | 404 | 401 | E | asserted |
| Settings and avatar | own only | n/a, keyed by session | 401 | E | asserted, plus `avatarKey` stripped |
| Canvas token storage | decrypts | other user id fails to decrypt | n/a | E | existing unit test |
| Calendar iCal feed | with token | with token only | unknown token 404 | E | asserted |
| Vault export and import jobs | 2xx | 404 | 401 | E | asserted |
| Session after sign-out everywhere | 401 | n/a | n/a | **missing (D1)** | asserted |
| Quiz generation spend | capped | n/a | 401 | **missing (C1)** | asserted |
| Marker callback | n/a | n/a | bad token 404 | E | existing test |
| Admin analytics | 403 for a non-admin | 403 | 401 | E | asserted |

Rows marked "existing" already have a test that exercises the real check. The test file links to it rather than duplicating it.

## Cross-review outcome

The implemented branch was cross-reviewed against this plan. Everything it found was fixed on the branch:

- **A committed save could keep an old stamp.** When a forced fetch or a rename moved the store's write version during a save, `mutateNote` dropped the result, so the next autosave conflicted. It now returns the saved note, and the editor adopts a stamp only if it isn't older than its base.
- **Reindex recovery retried a failing note on every 30 s pass.** It now re-stamps what it re-enqueues, so retries are spaced to one per 2-minute window and newer requests aren't starved. The marker has a partial index.
- **Notes that index themselves no longer request a reindex.** Every `insertNoteWithTree` with content had started requesting one. That would have re-embedded vault imports, and for vault PDFs replaced the Marker chunks that carry page numbers. It would also have put the starter note into retrieval and quizzes. Inserts now take `requestReindex: false` for vault notes and starter notes.
- **Two editor edge cases.** Pressing Save before the note loaded raised a conflict on a clean editor, and two quick "keep mine" presses sent two saves. Both are fixed.
- **Quiz top-up.** A full session still schedules a top-up of 5 cards while chunks are uncovered. The pending-batch guard is keyed by user and filter, so one filter's batch can't starve another.
- **Leftover tests.** Tests still mocked the deleted `tree-cache` module, and `exam-paper-import.test.ts` still asserted the call that was removed.

The security cross-review found no new exposure in the changed code. Two residuals predate this work:
- The internal Canvas MCP token lives for 15 minutes and isn't tied to `session_version`. It's minted server-side and never held by users.
- The new rate limits fall back to a per-process window while Redis is down, as `chat` already does.

## Rollout checks

- **Migration 086 and function ownership.** It replaces `app.update_notes_updated_at()`, so the migration role must own that function if it already exists. Run this read-only query as the migration role on dev and prod before merging: `SELECT n.nspname, pg_get_userbyid(p.proowner), current_user FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'update_notes_updated_at';`. If ownership is wrong, the migration fails inside its transaction and Jenkins stops before deploying. On 2026-11-12, 086 applied cleanly through `scripts/prebuild-migrate.ts` on a pre-branch schema, with the old function in either `app` or `public`.
- **The trigger exists.** Before merging A1, run a read-only query on each environment to confirm it: `SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'app.notes'::regclass AND NOT tgisinternal;`. Migration `085` already depends on the trigger existing.
- **Old drafts open in conflict once.** A draft saved before deploy has no `baseUpdatedAt`, so if it differs from the server it opens in conflict one time, and the user picks Save or "Load theirs".
- After deploying, open a note, type for more than 30 s with pauses, and confirm that no "saved elsewhere" toast appears.
