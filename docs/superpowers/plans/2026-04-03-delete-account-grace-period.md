# Delete Account Grace Period Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace instant hard-deletion with a GDPR-compliant 30-day grace period, with recovery endpoint and scheduled cleanup utility.

**Architecture:** `DELETE /api/auth/delete-account` soft-deletes by setting `deleted_at = NOW()` and clears session cookies. Login/session validation already checks `deleted_at IS NULL` so the account becomes inaccessible immediately. `POST /api/auth/cancel-deletion` authenticates with email+password, clears `deleted_at`, and issues a new session. Hard deletion logic is extracted to `src/lib/auth/account-deletion.ts` and called by a protected cleanup endpoint `POST /api/admin/cleanup-deleted-accounts`.

**Tech Stack:** Next.js App Router, TypeScript, postgres.js (`sql` tag), bcryptjs, existing `auth.js` utilities, existing logger/cache/storage patterns.

---

## File Map

| Action | Path                                                  | Purpose                                                     |
| ------ | ----------------------------------------------------- | ----------------------------------------------------------- |
| Modify | `src/app/api/auth/delete-account/route.ts`            | Soft-delete: set `deleted_at`, clear cookies                |
| Create | `src/lib/auth/account-deletion.ts`                    | `performHardAccountDeletion(userId)` utility                |
| Create | `src/app/api/auth/cancel-deletion/route.ts`           | Recovery: authenticate + clear `deleted_at` + issue session |
| Create | `src/app/api/admin/cleanup-deleted-accounts/route.ts` | Cron endpoint: hard-delete expired accounts                 |

Note: `src/lib/auth.js` already checks `AND deleted_at IS NULL` in `validateSession` — no change needed for Phase 2 (account inaccessibility).

---

### Task 1: Extract hard-deletion logic into `src/lib/auth/account-deletion.ts`

**Files:**

- Create: `src/lib/auth/account-deletion.ts`

- [ ] **Step 1: Create the file with `performHardAccountDeletion`**

```typescript
// src/lib/auth/account-deletion.ts
import sql from "@/database/pgsql.js";
import logger from "@/lib/logger";
import { getStorageProvider } from "@/lib/storage/init";
import { cacheInvalidate, cacheKeys } from "@/lib/cache";

/**
 * Permanently deletes all data for a user: S3 objects, Redis cache, and every
 * DB row belonging to them (in dependency order), then the login row itself.
 *
 * Called by the scheduled cleanup job — NOT by the delete-account endpoint.
 */
export async function performHardAccountDeletion(
  userId: string,
): Promise<void> {
  const storage = getStorageProvider();

  // 1. Collect all S3 keys before any DB deletion
  const noteS3Keys = await sql`
    SELECT s3_key FROM app.notes
    WHERE user_id = ${userId}::uuid AND s3_key IS NOT NULL
  `;
  const attachmentS3Keys = await sql`
    SELECT a.s3_key FROM app.attachments a
    JOIN app.notes n ON a.note_id = n.note_id
    WHERE n.user_id = ${userId}::uuid AND a.s3_key IS NOT NULL
  `;
  const jobS3Keys = await sql`
    SELECT input_s3_key AS s3_key FROM app.canvas_import_jobs
    WHERE user_id = ${userId}::uuid AND input_s3_key IS NOT NULL
    UNION ALL
    SELECT output_s3_key AS s3_key FROM app.canvas_import_jobs
    WHERE user_id = ${userId}::uuid AND output_s3_key IS NOT NULL
  `;

  const allS3Keys: string[] = [
    ...noteS3Keys.map((r: { s3_key: string }) => r.s3_key),
    ...attachmentS3Keys.map((r: { s3_key: string }) => r.s3_key),
    ...jobS3Keys.map((r: { s3_key: string }) => r.s3_key),
    `settings/${userId}/settings.json`,
  ];

  // 2. Delete S3 objects (best-effort)
  let s3Deleted = 0;
  let s3Failed = 0;
  await Promise.all(
    allS3Keys.map(async (key) => {
      try {
        await storage.deleteObject(key);
        s3Deleted++;
      } catch (err) {
        logger.warn("account-deletion: S3 delete failed", { key, error: err });
        s3Failed++;
      }
    }),
  );

  // 3. Invalidate Redis cache
  try {
    await cacheInvalidate(
      cacheKeys.settings(userId),
      cacheKeys.treeFull(userId),
      cacheKeys.treeChildren(userId, null),
    );
  } catch (err) {
    logger.warn("account-deletion: cache invalidation failed", { error: err });
  }

  // 4. Hard-delete all user data (leaf tables first)
  await sql`DELETE FROM app.quiz_reviews WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM app.quiz_sessions WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM app.quiz_cards WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM app.quiz_questions WHERE user_id = ${userId}::uuid`;
  await sql`
    DELETE FROM app.chat_messages
    WHERE session_id IN (
      SELECT id FROM app.chat_sessions WHERE user_id = ${userId}::uuid
    )
  `;
  await sql`DELETE FROM app.chat_sessions WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM app.user_streaks WHERE user_id = ${userId}::uuid`;
  await sql`
    DELETE FROM app.embeddings
    WHERE chunk_id IN (
      SELECT id FROM app.chunks WHERE user_id = ${userId}::uuid
    )
  `;
  await sql`DELETE FROM app.chunks WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM app.pdf_annotations WHERE user_id = ${userId}::uuid`;
  await sql`
    DELETE FROM app.attachments
    WHERE note_id IN (
      SELECT note_id FROM app.notes WHERE user_id = ${userId}::uuid
    )
  `;
  await sql`DELETE FROM app.pomodoro_sessions WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM app.time_blocks WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM app.assignments WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM app.tree_items WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM app.canvas_imports WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM app.canvas_import_jobs WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM app.notes WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM app.oauth_accounts WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM app.login WHERE user_id = ${userId}::uuid`;

  logger.info("account-deletion: user permanently deleted", {
    userId,
    s3Deleted,
    s3Failed,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth/account-deletion.ts
git commit -m "feat: extract hard account deletion logic into shared utility"
```

---

### Task 2: Rewrite `DELETE /api/auth/delete-account` to soft-delete

**Files:**

- Modify: `src/app/api/auth/delete-account/route.ts`

The route must:

1. Validate session + confirmation phrase (unchanged)
2. Set `deleted_at = NOW()` on `app.login` instead of deleting data
3. Clear all session cookies using the same exhaustive list as `logout/route.js`
4. Return `{ success: true, scheduledDeletion: <ISO date 30 days from now> }`

- [ ] **Step 1: Replace the route body**

Replace the entire file content with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth.js";
import sql from "@/database/pgsql.js";
import logger from "@/lib/logger";

const CONFIRM_PHRASE = "delete my account";

/**
 * DELETE /api/auth/delete-account
 *
 * Schedules the account for deletion (GDPR Article 17 — 30-day grace period):
 *   1. Validates session and confirmation phrase
 *   2. Sets deleted_at = NOW() on app.login (soft-delete marker)
 *   3. Clears all session cookies — account is immediately inaccessible
 *   4. Returns the date when permanent deletion will occur (30 days)
 *
 * Actual data erasure is performed by the cleanup job at
 *   POST /api/admin/cleanup-deleted-accounts
 * after the 30-day window expires.
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // validate confirmation phrase
    let body: { confirmation?: string } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    if (body.confirmation !== CONFIRM_PHRASE) {
      return NextResponse.json(
        { error: `Confirmation phrase must be exactly: "${CONFIRM_PHRASE}"` },
        { status: 400 },
      );
    }

    const userId = user.user_id;

    // mark account as scheduled for deletion — no data is erased yet
    await sql`
      UPDATE app.login
      SET deleted_at = NOW()
      WHERE user_id = ${userId}::uuid
    `;

    logger.info("delete-account: deletion scheduled", { userId });

    const scheduledDeletion = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const response = NextResponse.json({
      success: true,
      message:
        "Your account has been scheduled for deletion. You have 30 days to cancel this action.",
      scheduledDeletion,
    });

    // expire all session cookies immediately
    const expired = "Thu, 01 Jan 1970 00:00:00 UTC";
    const cookieNames = [
      "session",
      "authjs.session-token",
      "authjs.csrf-token",
      "authjs.callback-url",
      "__Secure-authjs.session-token",
      "__Secure-authjs.csrf-token",
      "__Secure-authjs.callback-url",
    ];
    for (const name of cookieNames) {
      response.headers.append(
        "Set-Cookie",
        `${name}=; Path=/; Expires=${expired}; HttpOnly; SameSite=Lax`,
      );
      response.headers.append(
        "Set-Cookie",
        `${name}=; Path=/; Expires=${expired}; HttpOnly; Secure; SameSite=Lax`,
      );
    }

    return response;
  } catch (err) {
    logger.error("delete-account error", { error: err });
    return NextResponse.json(
      { error: "Failed to schedule account deletion" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/auth/delete-account/route.ts
git commit -m "feat: switch delete-account to 30-day soft-delete grace period"
```

---

### Task 3: Create `POST /api/auth/cancel-deletion` recovery endpoint

**Files:**

- Create: `src/app/api/auth/cancel-deletion/route.ts`

Logic:

1. Parse `{ email, password }` from body
2. Look up user by email — must have `deleted_at IS NOT NULL`
3. Verify password with bcrypt
4. Check `deleted_at > NOW() - INTERVAL '30 days'` (still within grace period)
5. Clear `deleted_at` (set to NULL)
6. Call `createAuthSession` to issue a fresh JWT session cookie
7. Return success with user info

- [ ] **Step 1: Create the file**

```typescript
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import sql from "@/database/pgsql.js";
import { createAuthSession, createErrorResponse } from "@/lib/auth.js";
import logger from "@/lib/logger";

/**
 * POST /api/auth/cancel-deletion
 *
 * Recovers an account that is within its 30-day deletion grace period.
 * The user must authenticate with email + password (their session is gone).
 *
 * Body: { email: string; password: string }
 *
 * Success: clears deleted_at, issues a new session, returns user info.
 * Error cases:
 *   - 400: missing/invalid body
 *   - 401: wrong credentials
 *   - 403: no pending deletion found for this account
 *   - 410: grace period expired — permanent deletion has already run
 */
export async function POST(request: NextRequest) {
  try {
    let body: { email?: string; password?: string } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "email and password are required" },
        { status: 400 },
      );
    }

    // fetch account — must have a pending deletion
    const [user] = await sql`
      SELECT user_id, email, hashed_password, deleted_at
      FROM app.login
      WHERE email = ${email.trim().toLowerCase()}
    `;

    if (!user) {
      // same message as login to avoid user enumeration
      return createErrorResponse("Invalid email or password", 401);
    }

    if (!user.deleted_at) {
      return NextResponse.json(
        { error: "This account does not have a pending deletion." },
        { status: 403 },
      );
    }

    // check grace period: deleted_at must be within the last 30 days
    const deletedAt = new Date(user.deleted_at);
    const gracePeriodEnd = new Date(
      deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    if (Date.now() > gracePeriodEnd.getTime()) {
      return NextResponse.json(
        {
          error:
            "The 30-day recovery window has expired. This account has been permanently deleted.",
        },
        { status: 410 },
      );
    }

    // verify password
    if (!user.hashed_password) {
      return NextResponse.json(
        {
          error:
            "This account uses OAuth login and cannot be recovered via password. Please contact support.",
        },
        { status: 400 },
      );
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.hashed_password,
    );
    if (!passwordMatches) {
      return createErrorResponse("Invalid email or password", 401);
    }

    // restore the account
    await sql`
      UPDATE app.login
      SET deleted_at = NULL
      WHERE user_id = ${user.user_id}::uuid
    `;

    logger.info("cancel-deletion: account restored", { userId: user.user_id });

    // issue a new session (1-day default)
    return createAuthSession(user, 1);
  } catch (err) {
    logger.error("cancel-deletion error", { error: err });
    return NextResponse.json(
      { error: "Failed to cancel deletion" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/auth/cancel-deletion/route.ts
git commit -m "feat: add cancel-deletion endpoint for 30-day grace period recovery"
```

---

### Task 4: Create `POST /api/admin/cleanup-deleted-accounts` cron endpoint

**Files:**

- Create: `src/app/api/admin/cleanup-deleted-accounts/route.ts`

Logic:

1. Check `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>` header
2. Query `app.login WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'`
3. For each result, call `performHardAccountDeletion(userId)`
4. Return summary `{ deleted: N, failed: N, errors: [...] }`

- [ ] **Step 1: Create the file**

```typescript
import { NextRequest, NextResponse } from "next/server";
import sql from "@/database/pgsql.js";
import logger from "@/lib/logger";
import { performHardAccountDeletion } from "@/lib/auth/account-deletion";

/**
 * POST /api/admin/cleanup-deleted-accounts
 *
 * Permanently deletes accounts whose 30-day grace period has expired.
 * Protected by CRON_SECRET — only callable by the scheduled job.
 *
 * Auth: x-cron-secret header must match CRON_SECRET env var.
 *
 * Response: { deleted: number; failed: number; errors: string[] }
 */
export async function POST(request: NextRequest) {
  // authenticate the cron caller
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error("cleanup-deleted-accounts: CRON_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const providedSecret =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // find accounts past their grace period
  const expired = await sql`
    SELECT user_id
    FROM app.login
    WHERE deleted_at IS NOT NULL
      AND deleted_at < NOW() - INTERVAL '30 days'
  `;

  if (expired.length === 0) {
    logger.info("cleanup-deleted-accounts: no accounts to purge");
    return NextResponse.json({ deleted: 0, failed: 0, errors: [] });
  }

  let deleted = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of expired) {
    const userId: string = row.user_id;
    try {
      await performHardAccountDeletion(userId);
      deleted++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${userId}: ${message}`);
      logger.error("cleanup-deleted-accounts: failed to delete user", {
        userId,
        error: err,
      });
    }
  }

  logger.info("cleanup-deleted-accounts: purge complete", {
    deleted,
    failed,
    total: expired.length,
  });

  return NextResponse.json({ deleted, failed, errors });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/cleanup-deleted-accounts/route.ts
git commit -m "feat: add cron endpoint for hard-deleting expired grace period accounts"
```

---

### Task 5: Verify login rejection for soft-deleted accounts

**Files:**

- Read: `src/lib/auth.js` (already checked — no changes needed)

- [ ] **Step 1: Confirm `validateSession` already rejects soft-deleted accounts**

In `src/lib/auth.js:60-66`, `validateSession` queries:

```sql
SELECT user_id, email FROM app.login
WHERE user_id = $1::uuid
  AND is_active = true
  AND deleted_at IS NULL
```

This means any account with `deleted_at IS NOT NULL` will return no rows → `validateSession` returns `null` → all protected routes return 401. No code change needed.

- [ ] **Step 2: Confirm login route also rejects soft-deleted accounts**

In `src/app/api/auth/login/route.js:73-92`, the login route:

1. Selects `deleted_at` from `app.login`
2. Checks `if (user.is_active === false || user.deleted_at)` → returns 403

Login is blocked. However, the current error message is generic ("This account has been deactivated"). For soft-deleted accounts, a more helpful message is appropriate. Update the login route:

```javascript
// reject soft-deleted accounts — distinguish from hard deactivation
if (user.deleted_at) {
  const deletedAt = new Date(user.deleted_at);
  const gracePeriodEnd = new Date(
    deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000,
  );
  const daysRemaining = Math.max(
    0,
    Math.ceil((gracePeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );
  return createErrorResponse(
    daysRemaining > 0
      ? `This account is scheduled for deletion in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}. To recover it, use the account recovery option.`
      : "This account has been permanently deleted.",
    403,
  );
}

// reject hard-deactivated accounts
if (user.is_active === false) {
  return createErrorResponse(
    "This account has been deactivated. Contact support if this was a mistake.",
    403,
  );
}
```

Replace the existing combined check (`if (user.is_active === false || user.deleted_at)`) with the two separate checks above.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/login/route.js
git commit -m "feat: improve login rejection message for soft-deleted accounts"
```

---

### Task 6: Final verification

- [ ] **Step 1: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (or same errors as before this change).

- [ ] **Step 2: Verify all new files exist**

```bash
ls src/lib/auth/account-deletion.ts \
   src/app/api/auth/cancel-deletion/route.ts \
   src/app/api/admin/cleanup-deleted-accounts/route.ts
```

Expected: all three paths print without error.

- [ ] **Step 3: Verify delete-account route no longer references `performHardAccountDeletion` or direct DB deletes**

```bash
grep -n "DELETE FROM" src/app/api/auth/delete-account/route.ts
```

Expected: no output (soft-delete route only does an UPDATE).
