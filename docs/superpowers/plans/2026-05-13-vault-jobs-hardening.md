# Vault Jobs Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the seven hardening gaps in the vault import/export system: configurable SMTP (self-host blocker), BullMQ retries, export per-file progress, 409-on-conflict, explicit cancellation, RAG opt-out, and orphan cleanup for failed imports.

**Architecture:** Each task is independently shippable. Tasks 0-3 are quick wins (≤30 min each); Task 4 (cancellation) is the largest and depends on Task 3 (the worker needs a place to check for cancellation between files, which the existing `processed % 50` block in `export-worker.js:194-197` already provides). Tasks 5-6 are independent of everything else.

**Tech Stack:** Next.js App Router API routes, BullMQ + Redis, AWS SDK v3 S3 client (MinIO-compatible), `nodemailer` SMTP, Postgres via `@/database/pgsql.js`, vitest for tests.

**Test pattern:** Mirror `src/__tests__/api/canvas-status.test.ts` — mock `@/database/pgsql.js` and `@/lib/api-error`, import the route handler, call with a `NextRequest`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/email.js` | Modify | Read SMTP host/port/secure from env so self-host works without SES |
| `src/lib/queue.ts` | Modify (line 41-45) | Bump `attempts` to 3 with backoff for vault jobs |
| `database/migrations/029_vault_progress_and_cancel.sql` | Create | Add `processed_files`, `cancel_requested_at` to `app.canvas_import_jobs` |
| `src/lib/vault/export-worker.js` | Modify (lines 194-197) | Persist `processed_files`; check `cancel_requested_at` between files |
| `src/lib/vault/import-worker.js` | Modify (lines 366-368) | Persist `processed_files`; check `cancel_requested_at` between entries; honor `skip_rag` flag |
| `src/app/api/vault/status/route.ts` | Modify | Surface `processed_files` for exports; expose `cancel_requested` flag |
| `src/app/api/vault/export/route.ts` | Modify | Return 409 if active job exists unless `?force=true` |
| `src/app/api/vault/import/start/route.ts` | Modify | Return 409 if active job exists unless `force=true`; pass `skipRAG` into job payload |
| `src/app/api/vault/jobs/[jobId]/cancel/route.ts` | Create | DELETE endpoint — sets `cancel_requested_at` |
| `src/components/settings/data-export-section.jsx` | Modify | Add "Cancel" button, handle 409 with confirm-and-force prompt, show export `processed/total` |
| `src/__tests__/api/vault-export.test.ts` | Create | Coverage for export route conflict + cancel |
| `src/__tests__/api/vault-import-start.test.ts` | Create | Coverage for import start route conflict + skipRAG |
| `src/__tests__/api/vault-cancel.test.ts` | Create | Coverage for cancel endpoint |
| `src/__tests__/api/vault-status.test.ts` | Create | Coverage for new status response shape |

---

## Task 0: Configurable SMTP host (self-host unblock)

**Why:** `src/lib/email.js:7` hardcodes `email-smtp.${sesRegion}.amazonaws.com` — fine for AWS, but a blocker if you deploy off AWS (MinIO + your own Postfix/Mailgun/local mail). Adding three env vars makes the transport portable; SES remains the default when they're unset.

**Files:**
- Modify: `src/lib/email.js:4-16`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/email-transport.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("email transport configuration", () => {
  const original = { ...process.env };

  beforeEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("SMTP_") || k.startsWith("SES_") || k.startsWith("AWS_SES_")) {
        delete process.env[k];
      }
    }
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("uses SMTP_HOST when set", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "2525";
    process.env.SMTP_SECURE = "true";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    const { _getTransportOptions } = await import("@/lib/email");
    const opts = _getTransportOptions();
    expect(opts.host).toBe("smtp.example.com");
    expect(opts.port).toBe(2525);
    expect(opts.secure).toBe(true);
    expect(opts.auth).toEqual({ user: "u", pass: "p" });
  });

  it("falls back to SES SMTP host when SMTP_HOST is unset", async () => {
    process.env.SES_REGION = "us-west-2";
    process.env.SES_ACCESS_KEY_ID = "k";
    process.env.SES_SECRET_ACCESS_KEY = "s";
    const { _getTransportOptions } = await import("@/lib/email");
    const opts = _getTransportOptions();
    expect(opts.host).toBe("email-smtp.us-west-2.amazonaws.com");
    expect(opts.port).toBe(587);
    expect(opts.secure).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/email-transport.test.ts`
Expected: FAIL with `_getTransportOptions is not a function`

- [ ] **Step 3: Implement the change in `src/lib/email.js`**

Replace lines 1-16 with:

```javascript
import nodemailer from "nodemailer";

// Amplify blocks AWS_ prefixed env vars, so fall back to SES_ prefix
const sesRegion =
  process.env.AWS_SES_REGION || process.env.SES_REGION || "eu-west-1";

// Exported for tests; not part of the public API.
export function _getTransportOptions() {
  const host = process.env.SMTP_HOST || `email-smtp.${sesRegion}.amazonaws.com`;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = (process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user =
    process.env.SMTP_USER ||
    process.env.AWS_SES_ACCESS_KEY_ID ||
    process.env.SES_ACCESS_KEY_ID;
  const pass =
    process.env.SMTP_PASS ||
    process.env.AWS_SES_SECRET_ACCESS_KEY ||
    process.env.SES_SECRET_ACCESS_KEY;
  return { host, port, secure, auth: { user, pass } };
}

const transporter = nodemailer.createTransport(_getTransportOptions());
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/email-transport.test.ts`
Expected: PASS (both cases)

- [ ] **Step 5: Update self-host docs**

Append to `README.md` (or `SETUP.md` if it has an env section):

```markdown
## Self-hosted email (alternative to AWS SES)

Set these env vars to point at any SMTP server:

- `SMTP_HOST` (e.g. `smtp.mailgun.org`, `localhost`)
- `SMTP_PORT` (default `587`)
- `SMTP_SECURE` (`true` for port 465 TLS, `false` for STARTTLS)
- `SMTP_USER`, `SMTP_PASS`

If `SMTP_HOST` is unset, falls back to AWS SES at `email-smtp.${SES_REGION}.amazonaws.com`.
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/email.js src/__tests__/lib/email-transport.test.ts README.md
git commit -m "make smtp transport configurable for self-hosted deployments"
```

---

## Task 1: BullMQ retry with backoff

**Why:** `src/lib/queue.ts:44` has `attempts: 1` — any transient network blip during a 5-min export becomes a hard failure. Three attempts with exponential backoff (1s, 5s, 25s) catches the vast majority of transient issues without making bad jobs loop forever.

**Files:**
- Modify: `src/lib/queue.ts:41-45`

- [ ] **Step 1: Make the change**

Replace `src/lib/queue.ts:41-45`:

```typescript
// keep the last 200 completed/failed jobs for observability; older are pruned
const DEFAULT_OPTS: JobsOptions = {
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 200 },
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
};
```

- [ ] **Step 2: Verify type compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Note the worker idempotency requirement**

Add this comment above `DEFAULT_OPTS`:

```typescript
// Workers MUST be idempotent: attempts > 1 means a job may re-run mid-processing.
// Vault import/export workers handle this by checking job.status before mutating DB state
// and by re-using deterministic S3 keys (vault/{userId}/{jobId}/...).
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/queue.ts
git commit -m "retry vault/canvas jobs 3x with exponential backoff"
```

---

## Task 2: Persist export progress + surface in status response

**Why:** Export worker (`export-worker.js:194`) increments a local `processed` counter but never writes it to the DB. Status response (`status/route.ts:91-104`) returns no progress for exports. Adding a `processed_files` column lets the UI show "Exported 312/847 files" mirroring what import already does. This column also becomes the natural place for the cancellation check in Task 4 (worker is already there every 50 files).

**Files:**
- Create: `database/migrations/029_vault_progress_and_cancel.sql`
- Modify: `src/lib/vault/export-worker.js:194-198`
- Modify: `src/lib/vault/import-worker.js` (the progress write site near line 366)
- Modify: `src/app/api/vault/status/route.ts:23-31, 65-89`
- Modify: `src/components/settings/data-export-section.jsx` (export progress display)
- Create: `src/__tests__/api/vault-status.test.ts`

- [ ] **Step 1: Write the migration**

Create `database/migrations/029_vault_progress_and_cancel.sql`:

```sql
-- 029: vault job progress + cooperative cancellation
ALTER TABLE app.canvas_import_jobs
  ADD COLUMN IF NOT EXISTS processed_files INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_canvas_import_jobs_cancel
  ON app.canvas_import_jobs (id)
  WHERE cancel_requested_at IS NOT NULL;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npm run migrate`
Expected: `applied 029_vault_progress_and_cancel.sql`

- [ ] **Step 3: Update export worker to persist progress**

In `src/lib/vault/export-worker.js`, replace lines 194-198:

```javascript
        processed++;
        if (processed % 50 === 0) {
          await sql`
            UPDATE app.canvas_import_jobs
            SET processed_files = ${processed}, updated_at = NOW()
            WHERE id = ${jobId}::uuid
          `;
          console.log(`[${ts()}] Exported ${processed}/${totalFiles} files`);
        }
```

Also after the loop ends but before `zip.end()` (around line 205), add a final flush:

```javascript
    await sql`
      UPDATE app.canvas_import_jobs
      SET processed_files = ${processed}
      WHERE id = ${jobId}::uuid
    `;
```

- [ ] **Step 4: Update import worker to persist progress**

In `src/lib/vault/import-worker.js`, find the existing every-10-files update (search for `expected_total` near line 366) and add `processed_files` to that same `UPDATE` so we use one query, not two:

```javascript
        if (totalFiles % 10 === 0) {
          await sql`
            UPDATE app.canvas_import_jobs
            SET expected_total = ${totalFiles},
                processed_files = ${totalFiles},
                updated_at = NOW()
            WHERE id = ${jobId}::uuid
          `;
        }
```

- [ ] **Step 5: Write the failing status route test**

Create `src/__tests__/api/vault-status.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  return { default: sqlMock };
});

vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler: (handler: () => Promise<Response>) => handler,
  ApiError: class extends Error {
    constructor(public status: number, msg: string) { super(msg); }
  },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class { send() {} },
  GetObjectCommand: class { constructor(public input: unknown) {} },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed.example/file.zip"),
}));

import sql from "@/database/pgsql.js";
import { requireAuth } from "@/lib/api-error";
import { GET } from "@/app/api/vault/status/route";

describe("GET /api/vault/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "u1" } as never);
    process.env.STORAGE_BUCKET = "test";
  });

  it("returns export progress with processed_files", async () => {
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: "j1",
        type: "vault-export",
        status: "processing",
        created_at: "2026-05-13T00:00:00Z",
        started_at: "2026-05-13T00:00:01Z",
        completed_at: null,
        expected_total: 100,
        processed_files: 42,
        cancel_requested_at: null,
        output_s3_key: null,
        download_url: null,
        error_message: null,
      },
    ] as never);

    const res = await GET(
      new NextRequest("http://localhost/api/vault/status?type=vault-export"),
    );
    const body = await res.json();

    expect(body.progress).toEqual({ completed: 42, total: 100, percent: 42 });
    expect(body.job.cancelRequested).toBe(false);
  });

  it("flags cancelRequested when cancel_requested_at is set", async () => {
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: "j1",
        type: "vault-import",
        status: "processing",
        created_at: "2026-05-13T00:00:00Z",
        started_at: "2026-05-13T00:00:01Z",
        completed_at: null,
        expected_total: 10,
        processed_files: 3,
        cancel_requested_at: "2026-05-13T00:01:00Z",
        output_s3_key: null,
        download_url: null,
        error_message: null,
      },
    ] as never);
    vi.mocked(sql).mockResolvedValueOnce([{ total: "3" }] as never);

    const res = await GET(
      new NextRequest("http://localhost/api/vault/status?type=vault-import"),
    );
    const body = await res.json();

    expect(body.job.cancelRequested).toBe(true);
  });
});
```

- [ ] **Step 6: Run test, confirm it fails**

Run: `npx vitest run src/__tests__/api/vault-status.test.ts`
Expected: FAIL (response missing `cancelRequested`, export progress is null)

- [ ] **Step 7: Update `src/app/api/vault/status/route.ts`**

Replace lines 23-31 (the SQL `SELECT`):

```typescript
  const [job] = await sql`
    SELECT id, type, status, created_at, started_at, completed_at,
           expected_total, processed_files, cancel_requested_at,
           error_message, output_s3_key, download_url
    FROM app.canvas_import_jobs
    WHERE user_id = ${user.user_id}
      AND type = ${type}
    ORDER BY created_at DESC
    LIMIT 1
  `;
```

Replace lines 65-89 (the progress block):

```typescript
  // unified progress for both import and export
  let progress = null;
  if (["processing", "complete"].includes(job.status)) {
    const completed = job.processed_files ?? 0;
    const total = job.expected_total ?? 0;
    progress = {
      completed,
      total,
      percent: total > 0
        ? Math.min(100, Math.round((completed / total) * 100))
        : null,
    };
  }
```

Replace the response object (line 91-104):

```typescript
  return NextResponse.json({
    job: {
      jobId: job.id,
      type: job.type,
      status: job.status,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      expectedTotal: job.expected_total,
      cancelRequested: !!job.cancel_requested_at,
      error: job.error_message,
    },
    downloadUrl,
    progress,
  });
```

- [ ] **Step 8: Run test, confirm it passes**

Run: `npx vitest run src/__tests__/api/vault-status.test.ts`
Expected: PASS (both cases)

- [ ] **Step 9: Update UI to show export progress**

In `src/components/settings/data-export-section.jsx`, find the export status block (the part rendered when `exportJob?.status === "processing"`) and use the new `progress` field the same way import already does — `{progress.completed}/{progress.total} files exported · {progress.percent}%`.

- [ ] **Step 10: Commit**

```bash
git add database/migrations/029_vault_progress_and_cancel.sql \
        src/lib/vault/export-worker.js src/lib/vault/import-worker.js \
        src/app/api/vault/status/route.ts \
        src/components/settings/data-export-section.jsx \
        src/__tests__/api/vault-status.test.ts
git commit -m "persist and surface vault export progress; add cancel_requested_at column"
```

---

## Task 3: 409 on conflict with `?force=true` override

**Why:** Currently `POST /api/vault/export` silently cancels the in-flight job and starts a new one (`export/route.ts:16-23`). Two confused clicks = lost work with no warning. Returning 409 with `{ activeJobId }` lets the UI prompt the user; `?force=true` keeps the existing replace-and-restart behavior as an explicit opt-in.

**Files:**
- Modify: `src/app/api/vault/export/route.ts:1-47`
- Modify: `src/app/api/vault/import/start/route.ts:1-61`
- Modify: `src/components/settings/data-export-section.jsx` (handle 409)
- Create: `src/__tests__/api/vault-export.test.ts`
- Create: `src/__tests__/api/vault-import-start.test.ts`

- [ ] **Step 1: Write the failing test for export**

Create `src/__tests__/api/vault-export.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn() as unknown as { begin: ReturnType<typeof vi.fn> } & ReturnType<typeof vi.fn>;
  sqlMock.mockResolvedValue([]);
  sqlMock.begin = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(sqlMock));
  return { default: sqlMock };
});

vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler: (handler: (req: NextRequest) => Promise<Response>) => handler,
  ApiError: class extends Error {
    constructor(public status: number, msg: string) { super(msg); }
  },
}));

vi.mock("@/lib/queue", () => ({
  enqueueCanvasJob: vi.fn().mockResolvedValue(undefined),
}));

import sql from "@/database/pgsql.js";
import { requireAuth } from "@/lib/api-error";
import { POST } from "@/app/api/vault/export/route";

describe("POST /api/vault/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "u1" } as never);
  });

  it("returns 409 when an active export already exists", async () => {
    // First call: SELECT for existing active job — returns one
    vi.mocked(sql).mockResolvedValueOnce([{ id: "existing-job" }] as never);

    const res = await POST(new NextRequest("http://localhost/api/vault/export", { method: "POST" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.activeJobId).toBe("existing-job");
  });

  it("cancels existing job and starts new one when force=true", async () => {
    // SELECT returns active job
    vi.mocked(sql).mockResolvedValueOnce([{ id: "existing-job" }] as never);
    // UPDATE to cancel
    vi.mocked(sql).mockResolvedValueOnce([] as never);
    // INSERT for new job
    vi.mocked(sql).mockResolvedValueOnce([{ id: "new-job" }] as never);

    const res = await POST(new NextRequest("http://localhost/api/vault/export?force=true", { method: "POST" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe("new-job");
  });

  it("starts immediately when no active job exists", async () => {
    vi.mocked(sql).mockResolvedValueOnce([] as never); // no active job
    vi.mocked(sql).mockResolvedValueOnce([{ id: "new-job" }] as never); // insert

    const res = await POST(new NextRequest("http://localhost/api/vault/export", { method: "POST" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe("new-job");
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx vitest run src/__tests__/api/vault-export.test.ts`
Expected: FAIL (no 409 path)

- [ ] **Step 3: Update `src/app/api/vault/export/route.ts`**

Replace the entire file with:

```typescript
import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth } from "@/lib/api-error";
import sql from "@/database/pgsql.js";
import { enqueueCanvasJob } from "@/lib/queue";

export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";

  const [existing] = await sql`
    SELECT id FROM app.canvas_import_jobs
    WHERE user_id = ${user.user_id}
      AND type = 'vault-export'
      AND status IN ('queued', 'processing')
    LIMIT 1
  `;

  if (existing && !force) {
    return NextResponse.json(
      { error: "Export already in progress", activeJobId: existing.id },
      { status: 409 },
    );
  }

  const jobId = await sql.begin(async (tx) => {
    if (existing) {
      await tx`
        UPDATE app.canvas_import_jobs
        SET status = 'cancelled', completed_at = NOW()
        WHERE user_id = ${user.user_id}
          AND type = 'vault-export'
          AND status IN ('queued', 'processing')
      `;
    }
    const [row] = await tx`
      INSERT INTO app.canvas_import_jobs (user_id, type, status, job_type)
      VALUES (${user.user_id}, 'vault-export', 'queued', 'export')
      RETURNING id
    `;
    return row.id;
  });

  await enqueueCanvasJob("vault-export", { jobId, userId: user.user_id });
  return NextResponse.json({ jobId });
});
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx vitest run src/__tests__/api/vault-export.test.ts`
Expected: PASS (all three cases)

- [ ] **Step 5: Write the failing test for import start**

Create `src/__tests__/api/vault-import-start.test.ts` — same pattern as export test above, but for `@/app/api/vault/import/start/route`. Three cases: 409 on active, force=true override, immediate start. Use a body like `{ s3Key: "vault-uploads/u1/abc/x.zip" }`.

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn() as unknown as { begin: ReturnType<typeof vi.fn> } & ReturnType<typeof vi.fn>;
  sqlMock.mockResolvedValue([]);
  sqlMock.begin = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(sqlMock));
  return { default: sqlMock };
});
vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler: (h: (r: NextRequest) => Promise<Response>) => h,
  ApiError: class extends Error { constructor(public status: number, msg: string) { super(msg); } },
}));
vi.mock("@/lib/queue", () => ({ enqueueCanvasJob: vi.fn().mockResolvedValue(undefined) }));

import sql from "@/database/pgsql.js";
import { requireAuth } from "@/lib/api-error";
import { POST } from "@/app/api/vault/import/start/route";

const body = (data: Record<string, unknown>) =>
  new NextRequest("http://localhost/api/vault/import/start", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "content-type": "application/json" },
  });

describe("POST /api/vault/import/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "u1" } as never);
  });

  it("returns 409 when active import exists", async () => {
    vi.mocked(sql).mockResolvedValueOnce([{ id: "existing" }] as never);
    const res = await POST(body({ s3Key: "vault-uploads/u1/abc/x.zip" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ activeJobId: "existing" });
  });

  it("passes skipRAG flag through to job payload", async () => {
    const { enqueueCanvasJob } = await import("@/lib/queue");
    vi.mocked(sql).mockResolvedValueOnce([] as never); // no active
    vi.mocked(sql).mockResolvedValueOnce([{ id: "new" }] as never); // insert
    await POST(body({ s3Key: "vault-uploads/u1/abc/x.zip", skipRAG: true }));
    expect(enqueueCanvasJob).toHaveBeenCalledWith(
      "vault-import",
      expect.objectContaining({ skipRAG: true }),
    );
  });
});
```

- [ ] **Step 6: Run test, confirm it fails**

Run: `npx vitest run src/__tests__/api/vault-import-start.test.ts`
Expected: FAIL (no 409, no skipRAG)

- [ ] **Step 7: Update `src/app/api/vault/import/start/route.ts`**

Apply the same pattern: read body, optionally read `body.force`, return 409 if active and not force, then `INSERT` + `enqueueCanvasJob("vault-import", { jobId, userId, s3Key, skipRAG: !!body.skipRAG })`.

- [ ] **Step 8: Run test, confirm it passes**

Run: `npx vitest run src/__tests__/api/vault-import-start.test.ts`
Expected: PASS

- [ ] **Step 9: Update UI to handle 409**

In `src/components/settings/data-export-section.jsx`, in `handleVaultExport()` (around line 130) and the import upload completion handler (around line 105-114), after the `fetch` call, check `res.status === 409` and prompt:

```javascript
if (res.status === 409) {
  const body = await res.json();
  const confirm = window.confirm(
    "An export is already in progress. Cancel it and start a new one?"
  );
  if (!confirm) return;
  const retry = await fetch("/api/vault/export?force=true", { method: "POST" });
  // ...continue with retry response
}
```

Same logic for import — send `{ s3Key, force: true }` in the retry body.

- [ ] **Step 10: Commit**

```bash
git add src/app/api/vault/export/route.ts \
        src/app/api/vault/import/start/route.ts \
        src/components/settings/data-export-section.jsx \
        src/__tests__/api/vault-export.test.ts \
        src/__tests__/api/vault-import-start.test.ts
git commit -m "return 409 on vault job conflict; honor ?force=true for explicit replace"
```

---

## Task 4: Cooperative cancellation endpoint

**Why:** No way to stop a long-running import. Adding a cancel endpoint that sets `cancel_requested_at`, plus a worker check between files, gives users a real stop button. Cooperative (not preemptive) — the worker decides when to exit cleanly, so partial state is consistent. Depends on Task 2's `cancel_requested_at` column.

**Files:**
- Create: `src/app/api/vault/jobs/[jobId]/cancel/route.ts`
- Modify: `src/lib/vault/export-worker.js` (cancel check inside the file loop, around line 194)
- Modify: `src/lib/vault/import-worker.js` (cancel check inside the entry loop, around line 366)
- Modify: `src/components/settings/data-export-section.jsx` (Cancel button)
- Create: `src/__tests__/api/vault-cancel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/api/vault-cancel.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  return { default: sqlMock };
});
vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler: (h: (r: NextRequest, ctx: { params: { jobId: string } }) => Promise<Response>) => h,
  ApiError: class extends Error { constructor(public status: number, msg: string) { super(msg); } },
}));

import sql from "@/database/pgsql.js";
import { requireAuth } from "@/lib/api-error";
import { DELETE } from "@/app/api/vault/jobs/[jobId]/cancel/route";

describe("DELETE /api/vault/jobs/[jobId]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "u1" } as never);
  });

  it("sets cancel_requested_at and returns 200", async () => {
    vi.mocked(sql).mockResolvedValueOnce([{ id: "j1" }] as never);
    const req = new NextRequest("http://localhost/api/vault/jobs/j1/cancel", { method: "DELETE" });
    const res = await DELETE(req, { params: { jobId: "j1" } } as never);
    expect(res.status).toBe(200);
    expect(vi.mocked(sql)).toHaveBeenCalled();
  });

  it("returns 404 when job not found or not owned by user", async () => {
    vi.mocked(sql).mockResolvedValueOnce([] as never);
    const req = new NextRequest("http://localhost/api/vault/jobs/x/cancel", { method: "DELETE" });
    const res = await DELETE(req, { params: { jobId: "x" } } as never);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx vitest run src/__tests__/api/vault-cancel.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Create the route**

Create `src/app/api/vault/jobs/[jobId]/cancel/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

export const DELETE = withErrorHandler(
  async (_request, { params }: { params: { jobId: string } }) => {
    const user = await requireAuth();
    const { jobId } = params;

    const [updated] = await sql`
      UPDATE app.canvas_import_jobs
      SET cancel_requested_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}::uuid
        AND user_id = ${user.user_id}
        AND status IN ('queued', 'processing')
        AND cancel_requested_at IS NULL
      RETURNING id
    `;

    if (!updated) {
      throw new ApiError(404, "Job not found or not cancellable");
    }

    return NextResponse.json({ ok: true, jobId: updated.id });
  },
);
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx vitest run src/__tests__/api/vault-cancel.test.ts`
Expected: PASS

- [ ] **Step 5: Add cancel check to export worker**

In `src/lib/vault/export-worker.js`, modify the loop's every-50-files block (now from Task 2):

```javascript
        processed++;
        if (processed % 50 === 0) {
          const [cancelRow] = await sql`
            SELECT cancel_requested_at FROM app.canvas_import_jobs
            WHERE id = ${jobId}::uuid
          `;
          if (cancelRow?.cancel_requested_at) {
            console.log(`[${ts()}] Cancel requested for ${jobId}; aborting after ${processed} files`);
            await uploader.abort();
            await sql`
              UPDATE app.canvas_import_jobs
              SET status = 'cancelled', completed_at = NOW(), processed_files = ${processed}
              WHERE id = ${jobId}::uuid
            `;
            return; // exit the worker function
          }
          await sql`
            UPDATE app.canvas_import_jobs
            SET processed_files = ${processed}, updated_at = NOW()
            WHERE id = ${jobId}::uuid
          `;
          console.log(`[${ts()}] Exported ${processed}/${totalFiles} files`);
        }
```

- [ ] **Step 6: Add cancel check to import worker**

In `src/lib/vault/import-worker.js`, find the every-10-files progress update (now updated in Task 2) and add the same pattern: before the update, `SELECT cancel_requested_at`; if set, mark job `cancelled` and `return` from the worker. The S3-uploaded files and any partial notes remain (the cleanup is Task 6's job, optional).

- [ ] **Step 7: Add Cancel button to UI**

In `src/components/settings/data-export-section.jsx`, when an active job is showing (`status === "processing"` or `"queued"`), render a cancel button:

```jsx
{(exportJob?.status === "processing" || exportJob?.status === "queued") && (
  <button
    onClick={async () => {
      if (!window.confirm("Cancel the export? Partial output will be discarded.")) return;
      await fetch(`/api/vault/jobs/${exportJob.jobId}/cancel`, { method: "DELETE" });
      toast.info("Cancel requested. The job will stop shortly.");
    }}
    disabled={exportJob.cancelRequested}
  >
    {exportJob.cancelRequested ? "Cancelling..." : "Cancel"}
  </button>
)}
```

Same for import.

- [ ] **Step 8: Verify type check still passes**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 9: Run the test suite**

Run: `npx vitest run src/__tests__/api/`
Expected: all green

- [ ] **Step 10: Manual smoke test**

In dev:
1. Start a large import (>200 files)
2. Hit cancel from the UI within 5 seconds
3. Within 10s (next 10-file checkpoint) the status flips to `cancelled` and the worker logs `Cancel requested for ...; aborting after N entries`

If `npm run dev` isn't running or there's no large test fixture, skip and note this in the PR description.

- [ ] **Step 11: Commit**

```bash
git add src/app/api/vault/jobs/[jobId]/cancel/route.ts \
        src/lib/vault/export-worker.js src/lib/vault/import-worker.js \
        src/components/settings/data-export-section.jsx \
        src/__tests__/api/vault-cancel.test.ts
git commit -m "support cooperative cancellation for vault import/export jobs"
```

---

## Task 5: `skipRAG` import opt-out

**Why:** Today every imported PDF/DOCX gets pushed through Marker OCR + chunking + Cohere embeddings, which is expensive and slow. A user migrating data from another tool may not want any of that, just the file tree. A simple flag on the import-start request, plumbed through to the worker, lets them opt out. RAG remains the default.

**Files:**
- Modify: `src/app/api/vault/import/start/route.ts` (already touched in Task 3 to read `skipRAG` from body)
- Modify: `src/lib/vault/import-worker.js` (around line 350-362 — the RAG dispatch)
- Modify: `src/components/settings/data-export-section.jsx` (checkbox in import dialog)

- [ ] **Step 1: Add the worker guard**

In `src/lib/vault/import-worker.js`, find the block around line 350-362 that calls `extractWithMarker` / `chunkText`. Wrap it:

```javascript
        if (!msg.skipRAG && isProcessable(cleanPath)) {
          // existing RAG pipeline call
        }
```

- [ ] **Step 2: Write the worker behavior test**

Since worker tests in this repo tend to be smoke-only (BullMQ + Redis + S3 + DB integration), add a unit test for the `isProcessable` decision instead, asserting it's bypassed when `skipRAG` is true. Or — easier — extend the existing `vault-import-start.test.ts` (already in Task 3) to confirm the flag is forwarded; the worker check is a one-line `if`.

If you want an actual worker test, mock the RAG entry point and assert it's not called:

```typescript
// src/__tests__/lib/import-worker-skip-rag.test.ts
import { describe, it, expect, vi } from "vitest";

// Mock everything heavy first
vi.mock("@/lib/storage/s3", () => ({ getStorageProvider: vi.fn() }));
vi.mock("@/database/pgsql.js", () => ({ default: vi.fn() }));
vi.mock("@/lib/vault/rag-pipeline", () => ({ runRagPipeline: vi.fn() }));
// ...

import { runRagPipeline } from "@/lib/vault/rag-pipeline";
// import the worker and call its file-processing helper with skipRAG=true
// assert runRagPipeline was NOT called
```

(Choose whichever route fits the codebase; if `rag-pipeline.js` isn't a separate module, just extend the route test.)

- [ ] **Step 3: Add the UI checkbox**

In `data-export-section.jsx`, in the import section, add a checkbox before the file picker:

```jsx
<label>
  <input
    type="checkbox"
    checked={skipRag}
    onChange={(e) => setSkipRag(e.target.checked)}
  />
  Skip AI indexing (faster, but no chat/search over imported files)
</label>
```

And include `skipRAG: skipRag` in the `/api/vault/import/start` POST body.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/api/vault-import-start.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/vault/import-worker.js \
        src/components/settings/data-export-section.jsx
git commit -m "let users opt out of RAG indexing during vault import"
```

---

## Task 6: Cleanup orphaned partials on failed/cancelled imports

**Why:** When an import fails partway through (worker crash, cancellation, fatal S3 error), the files and notes it already created stay in the user's tree — confusing and hard to clean up manually. Add a cleanup pass that runs from the worker's catch block: deletes any notes/attachments/S3 keys created with this job's `id` as part of their path.

This is the medium-effort task. Consider whether you want it — partial-success is a defensible default. Skip if you'd rather give users explicit control via a "Roll back this import" button instead (much smaller scope).

**Files:**
- Create: `src/lib/vault/cleanup.js`
- Modify: `src/lib/vault/import-worker.js` (catch block around line 422-430)

- [ ] **Step 1: Implement the cleanup helper**

Create `src/lib/vault/cleanup.js`:

```javascript
import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import sql from "@/database/pgsql.js";

/**
 * Delete S3 objects and DB rows created for a specific import job.
 * Safe to call multiple times (idempotent).
 */
export async function rollbackImportJob({ jobId, userId }) {
  const bucket = process.env.STORAGE_BUCKET;
  const prefix = process.env.STORAGE_PREFIX || "oghma";
  const s3 = new S3Client({
    region: process.env.STORAGE_REGION || "us-east-1",
    ...(process.env.STORAGE_ENDPOINT && {
      endpoint: process.env.STORAGE_ENDPOINT,
      forcePathStyle: true,
    }),
  });

  // 1. List and delete S3 objects under vault/{userId}/{jobId}/
  const keyPrefix = `${prefix}/vault/${userId}/${jobId}/`;
  let continuationToken;
  do {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: keyPrefix,
      ContinuationToken: continuationToken,
    }));
    if (list.Contents?.length) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: list.Contents.map((o) => ({ Key: o.Key })) },
      }));
    }
    continuationToken = list.NextContinuationToken;
  } while (continuationToken);

  // 2. Delete DB rows tagged with this import_job_id
  await sql`DELETE FROM app.embeddings WHERE chunk_id IN (
    SELECT id FROM app.chunks WHERE import_job_id = ${jobId}::uuid
  )`;
  await sql`DELETE FROM app.chunks WHERE import_job_id = ${jobId}::uuid`;
  await sql`DELETE FROM app.attachments WHERE import_job_id = ${jobId}::uuid`;
  await sql`DELETE FROM app.notes WHERE import_job_id = ${jobId}::uuid AND user_id = ${userId}`;
}
```

> Pre-req: this depends on `notes`, `attachments`, `chunks` tables having an `import_job_id` column. If they don't, either: (a) add that column in migration 029 and have the import worker stamp it on every insert, or (b) skip this task. Check the schema before starting.

- [ ] **Step 2: Wire into the worker's catch**

In `src/lib/vault/import-worker.js`, replace lines 422-430 (the fatal error catch):

```javascript
  } catch (err) {
    console.error(`[${ts()}] Vault import failed:`, err.message);
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'failed', error_message = ${err.message}, completed_at = NOW()
      WHERE id = ${jobId}::uuid
    `;
    try {
      await rollbackImportJob({ jobId, userId });
      console.log(`[${ts()}] Rolled back partial import for ${jobId}`);
    } catch (rollbackErr) {
      console.error(`[${ts()}] Rollback failed for ${jobId}:`, rollbackErr.message);
    }
    throw err;
  }
```

- [ ] **Step 3: Add the schema column (if missing)**

If `app.notes` doesn't have `import_job_id`, add to migration 029 (or create 030):

```sql
ALTER TABLE app.notes      ADD COLUMN IF NOT EXISTS import_job_id UUID;
ALTER TABLE app.attachments ADD COLUMN IF NOT EXISTS import_job_id UUID;
ALTER TABLE app.chunks     ADD COLUMN IF NOT EXISTS import_job_id UUID;
CREATE INDEX IF NOT EXISTS idx_notes_import_job ON app.notes (import_job_id) WHERE import_job_id IS NOT NULL;
```

Then update all `INSERT` statements in `import-worker.js` to include `import_job_id = ${jobId}`.

- [ ] **Step 4: Decide before committing**

Honestly assess: do you want full rollback, or is partial-success acceptable? The Marker pipeline can fail per-file already without rolling everything back. A defensible alternative: skip the auto-rollback, instead add a user-triggered "Discard this import" button on failed jobs that calls the same `rollbackImportJob` helper as an explicit API endpoint.

- [ ] **Step 5: Commit (only if you pulled the trigger)**

```bash
git add src/lib/vault/cleanup.js src/lib/vault/import-worker.js \
        database/migrations/029_vault_progress_and_cancel.sql
git commit -m "roll back partial vault imports on worker failure"
```

---

## Self-Review Checklist

After implementing, verify:

- [ ] All seven gaps from the original list addressed (SMTP, retry, export progress, 409, cancel, skipRAG, orphan cleanup)
- [ ] No `attempts: 1` left in `src/lib/queue.ts`
- [ ] Migration 029 applied and idempotent
- [ ] Cancel UI button only appears for `processing`/`queued` jobs
- [ ] 409 response includes `activeJobId` so UI can target the right job for cancel
- [ ] Export status response now includes `progress` (was only set for imports before)
- [ ] `skipRAG` flag forwarded into job payload, not silently dropped
- [ ] `npx vitest run` passes
- [ ] `npx tsc --noEmit` passes
- [ ] No hardcoded `email-smtp.*.amazonaws.com` left

---

## Suggested Execution Order

The tasks are independently shippable — pick what you want, in any order. But if you do them all, this order minimizes rework:

1. **Task 0** — SMTP (5 min, unblocks self-host)
2. **Task 1** — Retry config (5 min)
3. **Task 2** — Progress column + status response (30 min, prereq for Task 4)
4. **Task 3** — 409 conflict (1 h)
5. **Task 4** — Cancellation (2 h, depends on Task 2)
6. **Task 5** — skipRAG (30 min)
7. **Task 6** — Orphan cleanup (1-2 h, optional)

Total: ~4-6 hours of focused work, plus testing.
