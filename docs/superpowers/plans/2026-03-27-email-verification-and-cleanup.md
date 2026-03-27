# Email Verification & Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hard-gated email verification for new registrations, extract shared token utilities, delete dead code (unused `[token]` reset page + unused contact API route).

**Architecture:** Shared token utility (`src/lib/tokens.js`) used by both password reset and email verification flows. Registration creates unverified users, login blocks unverified users, new `/verify-email` page + API endpoints handle verification. AWS SES via existing nodemailer transporter sends verification emails.

**Tech Stack:** Next.js 15 (App Router), PostgreSQL (via `postgres` tagged templates), nodemailer + AWS SES, bcryptjs, vitest

---

### Task 1: Delete Dead Code

**Files:**
- Delete: `src/app/reset-password/[token]/page.jsx`
- Delete: `src/app/api/contact/route.ts`

- [ ] **Step 1: Delete the dead reset-password token page**

```bash
rm -rf src/app/reset-password/\[token\]
```

The email link in `src/lib/email.js:22` generates `/reset-password?token=xxx` (query param). The working page at `src/app/reset-password/page.jsx` handles this. The `[token]` variant has a TODO'd-out backend call and is unreachable from real reset emails.

- [ ] **Step 2: Delete the unused contact API route**

```bash
rm src/app/api/contact/route.ts
```

The frontend `src/components/contact-form.jsx` posts directly to `https://api.web3forms.com/submit`. This backend route validates and logs but the frontend never calls it.

- [ ] **Step 3: Verify build still passes**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds, no broken imports

- [ ] **Step 4: Run tests**

Run: `npm run test:ci`
Expected: All 175 tests pass (no tests depend on deleted files)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "remove dead reset-password/[token] page and unused contact API route"
```

---

### Task 2: Create Shared Token Utility

**Files:**
- Create: `src/lib/tokens.js`
- Create: `src/__tests__/lib/tokens.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/lib/tokens.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { generateSecureToken, hashToken, verifyTokenHash } from '@/lib/tokens.js';

describe('generateSecureToken', () => {
    it('returns a 64-character hex string', () => {
        const token = generateSecureToken();
        expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('returns unique tokens on each call', () => {
        const a = generateSecureToken();
        const b = generateSecureToken();
        expect(a).not.toBe(b);
    });
});

describe('hashToken', () => {
    it('returns a 64-character hex string', () => {
        const hash = hashToken('abc123');
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('returns the same hash for the same input', () => {
        const a = hashToken('test-token');
        const b = hashToken('test-token');
        expect(a).toBe(b);
    });

    it('returns different hashes for different inputs', () => {
        const a = hashToken('token-a');
        const b = hashToken('token-b');
        expect(a).not.toBe(b);
    });
});

describe('verifyTokenHash', () => {
    it('returns true when raw token matches stored hash', () => {
        const raw = generateSecureToken();
        const stored = hashToken(raw);
        expect(verifyTokenHash(raw, stored)).toBe(true);
    });

    it('returns false when raw token does not match stored hash', () => {
        const raw = generateSecureToken();
        const stored = hashToken('different-token');
        expect(verifyTokenHash(raw, stored)).toBe(false);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/tokens.test.js`
Expected: FAIL -- module `@/lib/tokens.js` not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/tokens.js`:

```js
import crypto from 'crypto';

/**
 * generates a cryptographically secure random token (256 bits of entropy)
 * returns a 64-char hex string
 */
export function generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * hashes a raw token using SHA-256
 * used before storing tokens in the database so a DB breach doesn't expose raw values
 */
export function hashToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * verifies a raw token against a stored hash
 * hashes the raw token and compares to the stored value
 */
export function verifyTokenHash(rawToken, storedHash) {
    return hashToken(rawToken) === storedHash;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/tokens.test.js`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/tokens.js src/__tests__/lib/tokens.test.js && git commit -m "add shared token utility for secure token generation and verification"
```

---

### Task 3: Refactor Password Reset to Use Shared Token Utility

**Files:**
- Modify: `src/app/api/auth/password-reset/request/route.js`

- [ ] **Step 1: Refactor the password reset request route**

Replace the file `src/app/api/auth/password-reset/request/route.js` with:

```js
import sql from '@/database/pgsql.js';
import { sendPasswordResetEmail } from '@/lib/email.js';
import { createErrorResponse, parseJsonBody } from '@/lib/auth.js';
import { generateSecureToken, hashToken } from '@/lib/tokens.js';
import { checkRateLimit } from '@/lib/rateLimiter';
import logger from '@/lib/logger';

function resetAckResponse() {
    return new Response(
        JSON.stringify({ message: 'If that email exists, we sent a reset link' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
}

// burn CPU time equivalent to the real path to prevent timing attacks
function dummyWork() {
    hashToken(generateSecureToken());
}

export async function POST(request) {
    try {
        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;

        const { email } = body;
        if (!email) return createErrorResponse('Email is required', 400);

        const limited = await checkRateLimit('password-reset', email.trim().toLowerCase());
        if (limited) return limited;

        const users = await sql`
            SELECT user_id, email FROM app.login WHERE email = ${email.trim()}
        `;

        // constant-time: perform the same work regardless of whether email exists
        const start = Date.now();
        const MIN_RESPONSE_MS = 500;

        if (users.length === 0) {
            dummyWork();
            const elapsed = Date.now() - start;
            if (elapsed < MIN_RESPONSE_MS) {
                await new Promise(r => setTimeout(r, MIN_RESPONSE_MS - elapsed + Math.random() * 100));
            }
            return resetAckResponse();
        }

        const user = users[0];
        const resetToken = generateSecureToken();
        const expiresAt = new Date(Date.now() + 3600000); // 1 hour
        const tokenHash = hashToken(resetToken);

        await sql`
            UPDATE app.login
            SET reset_token = ${tokenHash}, reset_token_expires = ${expiresAt}
            WHERE user_id = ${user.user_id}
        `;

        await sendPasswordResetEmail(email, resetToken);

        const elapsed = Date.now() - start;
        if (elapsed < MIN_RESPONSE_MS) {
            await new Promise(r => setTimeout(r, MIN_RESPONSE_MS - elapsed));
        }
        return resetAckResponse();
    } catch (error) {
        logger.error('password reset request error', { error });
        return createErrorResponse('Failed to send reset email', 500);
    }
}
```

- [ ] **Step 2: Run all tests to confirm no regressions**

Run: `npm run test:ci`
Expected: All tests pass

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/password-reset/request/route.js && git commit -m "refactor password reset to use shared token utility"
```

---

### Task 4: Add Verification Email Template

**Files:**
- Modify: `src/lib/email.js`

- [ ] **Step 1: Add sendVerificationEmail to src/lib/email.js**

Add after the existing `sendPasswordResetEmail` function (before the permissions policy comment):

```js
export async function sendVerificationEmail(email, verificationToken) {
    const fromEmail = process.env.AWS_SES_FROM_EMAIL || process.env.SES_FROM_EMAIL;
    if (!fromEmail) {
        throw new Error('SES from-email not configured (set AWS_SES_FROM_EMAIL or SES_FROM_EMAIL)');
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

    const mailOptions = {
        from: fromEmail,
        to: email,
        subject: 'Verify your email address',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Verify Your Email</h2>
        <p>Thanks for signing up! Click the button below to verify your email address:</p>
        <a href="${verifyUrl}"
           style="background-color: #4299e1; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 5px; display: inline-block;">
          Verify Email
        </a>
        <p style="margin-top: 20px; color: #666;">This link expires in 24 hours.</p>
        <p style="color: #999; font-size: 12px;">If you didn't create an account, ignore this email.</p>
      </div>
    `,
        text: `Verify your email: ${verifyUrl}\n\nThis link expires in 24 hours.`,
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (err) {
        console.error('[email] failed to send verification email:', err.message);
        throw new Error('Failed to send verification email');
    }
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.js && git commit -m "add verification email template using AWS SES"
```

---

### Task 5: Database Migration -- Add Email Verification Columns

**Files:**
- Create: `database/migrations/add-email-verification.sql`

This is a SQL migration to be run against the production database. It won't be auto-run -- it needs manual execution.

- [ ] **Step 1: Write the migration SQL**

Create `database/migrations/add-email-verification.sql`:

```sql
-- add email verification columns to app.login
-- run this migration before deploying the email verification feature

ALTER TABLE app.login
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_token TEXT,
  ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMPTZ;

-- mark all existing users as verified (they've been using the app already)
UPDATE app.login SET email_verified = true WHERE email_verified = false;
```

- [ ] **Step 2: Commit**

```bash
git add database/migrations/add-email-verification.sql && git commit -m "add migration for email verification columns on app.login"
```

---

### Task 6: Modify Registration to Send Verification Email Instead of Creating Session

**Files:**
- Modify: `src/app/api/auth/register/route.js`

- [ ] **Step 1: Update the registration route**

Replace `src/app/api/auth/register/route.js` with:

```js
/*
 * register Route Handler
 * Creates new user account with validated credentials
 * 1. Validate request fields and password strength
 * 2. Check if user already exists
 * 3. Hash password and insert new user
 * 4. Generate verification token and send email
 * 5. Return success response (requires verification)
 */

import sql from "@/database/pgsql.js";
import {validateAuthCredentials} from "@/lib/validation.js";
import {createErrorResponse, createValidationErrorResponse, parseJsonBody} from "@/lib/auth.js";
import {generateUUID} from "@/lib/utils/uuid";
import {generateSecureToken, hashToken} from "@/lib/tokens.js";
import {sendVerificationEmail} from "@/lib/email.js";
import {checkRateLimit, getClientIp} from "@/lib/rateLimiter";
import bcrypt from "bcryptjs";
import logger from '@/lib/logger';

export async function POST(request) {
    try {
        const limited = await checkRateLimit('register', getClientIp(request));
        if (limited) return limited;

        // 1. Parse and validate request body
        const {data: body, error: parseError} = await parseJsonBody(request);
        if (parseError) return parseError;

        const {email, password} = body;

        // 2. Validate credentials format and password strength
        const validation = validateAuthCredentials(email, password, true);
        if (!validation.isValid) {
            return createValidationErrorResponse(validation.errors);
        }

        // 3. Check if user already exists
        const existingUser = await sql`
            SELECT user_id
            FROM app.login
            WHERE email = ${email.trim()}
        `;

        if (existingUser.length > 0) {
            return createErrorResponse('User already exists', 409);
        }

        // 4. Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 5. Generate UUID v7 for user
        const userId = generateUUID();

        // 6. Generate verification token
        const verificationToken = generateSecureToken();
        const tokenHash = hashToken(verificationToken);
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // 7. Insert new user with email_verified = false
        const data = await sql`
            INSERT INTO app.login (user_id, email, hashed_password, email_verified, verification_token, verification_token_expires)
            VALUES (${userId}::uuid, ${email.trim()}, ${hashedPassword}, false, ${tokenHash}, ${tokenExpires})
            RETURNING user_id, email
        `;

        const user = data[0];

        if (!user) {
            return createErrorResponse('An error occurred while creating your account', 500);
        }

        // 8. Send verification email
        try {
            await sendVerificationEmail(email.trim(), verificationToken);
        } catch (emailErr) {
            logger.error('failed to send verification email during registration', { error: emailErr.message });
            // account is created but email failed -- user can resend later
        }

        // 9. Return success with requiresVerification flag (no session created)
        return new Response(
            JSON.stringify({
                success: true,
                requiresVerification: true,
                message: 'Account created. Please check your email to verify your account.',
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        logger.error('registration error', {
            message: error.message,
            code: error.code,
            detail: error.detail,
        });

        if (error.code === '23505' && error.detail && error.detail.includes('email')) {
            return createErrorResponse('User already exists', 409);
        }

        return createErrorResponse('Internal server error', 500);
    }
}
```

- [ ] **Step 2: Update register page to redirect to /verify-email**

In `src/app/register/page.js`, update the `handleSubmit` function. Replace lines 38-42:

Old:
```js
      await register(email, pwd)
      router.replace('/notes')
      // fallback redirect in case router.replace doesn't work
      setTimeout(() => { window.location.href = '/notes' }, 1000)
```

New:
```js
      const result = await register(email, pwd)
      if (result.requiresVerification) {
        router.replace(`/verify-email?email=${encodeURIComponent(email)}`)
        setTimeout(() => { window.location.href = `/verify-email?email=${encodeURIComponent(email)}` }, 1000)
      } else {
        router.replace('/notes')
        setTimeout(() => { window.location.href = '/notes' }, 1000)
      }
```

- [ ] **Step 3: Run tests**

Run: `npm run test:ci`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/register/route.js src/app/register/page.js && git commit -m "registration sends verification email instead of creating session"
```

---

### Task 7: Add Login Hard Gate for Unverified Users

**Files:**
- Modify: `src/app/api/auth/login/route.js`
- Modify: `src/app/login/page.js`

- [ ] **Step 1: Update login route to check email_verified**

In `src/app/api/auth/login/route.js`, add `email_verified` to the SELECT query on line 53:

Old:
```js
            SELECT user_id, email, hashed_password, is_active, deleted_at
```

New:
```js
            SELECT user_id, email, hashed_password, is_active, deleted_at, email_verified
```

Then, after the successful password check (after line 92 `await clearFailedAttempts(email);`), add:

```js
        // 7b. Check email verification status
        if (user.email_verified === false) {
            return new Response(
                JSON.stringify({
                    requiresVerification: true,
                    email: user.email,
                    message: 'Please verify your email address before signing in.',
                }),
                { status: 403, headers: { 'Content-Type': 'application/json' } }
            );
        }
```

- [ ] **Step 2: Update login page to handle requiresVerification response**

In `src/app/login/page.js`, update the `handleSubmit` catch block. The `login()` call in apiClient throws an `APIError` for non-200 responses. We need to catch the 403 with `requiresVerification` before the generic error handling.

Replace lines 45-63 (the handleSubmit function body):

```js
    setLoading(true)
    try {
      const response = await login(email, pwd, rememberMe)
      router.replace('/notes')
      setTimeout(() => { window.location.href = '/notes' }, 1000)
    } catch (err) {
      // check if the error is a verification-required response
      if (err.status === 403 && err.data?.requiresVerification) {
        router.replace(`/verify-email?email=${encodeURIComponent(err.data.email || email)}`)
        return
      }
      setErrMsg(getErrorMessage(err))
      setPwd('')
      errRef.current?.focus()
      setLoading(false)
    }
```

- [ ] **Step 3: Run tests**

Run: `npm run test:ci`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/login/route.js src/app/login/page.js && git commit -m "login blocks unverified users and redirects to verification page"
```

---

### Task 8: Create Verify Email API Endpoint

**Files:**
- Create: `src/app/api/auth/verify-email/route.js`

- [ ] **Step 1: Create the verify-email API route**

Create `src/app/api/auth/verify-email/route.js`:

```js
import sql from '@/database/pgsql.js';
import { createAuthSession, createErrorResponse, parseJsonBody } from '@/lib/auth.js';
import { verifyTokenHash } from '@/lib/tokens.js';
import { checkRateLimit, getClientIp } from '@/lib/rateLimiter';
import logger from '@/lib/logger';

export async function POST(request) {
    try {
        const limited = await checkRateLimit('verify-email', getClientIp(request));
        if (limited) return limited;

        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;

        const { token } = body;
        if (!token) return createErrorResponse('Verification token is required', 400);

        // find users with unexpired verification tokens
        const users = await sql`
            SELECT user_id, email, verification_token
            FROM app.login
            WHERE verification_token IS NOT NULL
              AND verification_token_expires > NOW()
              AND email_verified = false
        `;

        // check the token hash against each candidate
        const matchedUser = users.find(u => verifyTokenHash(token, u.verification_token));

        if (!matchedUser) {
            return createErrorResponse('Invalid or expired verification token', 400);
        }

        // mark email as verified, clear token
        await sql`
            UPDATE app.login
            SET email_verified = true, verification_token = NULL, verification_token_expires = NULL
            WHERE user_id = ${matchedUser.user_id}
        `;

        // auto-login: create session for the verified user
        return await createAuthSession(matchedUser, 1);
    } catch (error) {
        logger.error('email verification error', { error });
        return createErrorResponse('Failed to verify email', 500);
    }
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/verify-email/route.js && git commit -m "add verify-email API endpoint with auto-login on success"
```

---

### Task 9: Create Resend Verification API Endpoint

**Files:**
- Create: `src/app/api/auth/resend-verification/route.js`

- [ ] **Step 1: Create the resend-verification API route**

Create `src/app/api/auth/resend-verification/route.js`:

```js
import sql from '@/database/pgsql.js';
import { createErrorResponse, parseJsonBody } from '@/lib/auth.js';
import { generateSecureToken, hashToken } from '@/lib/tokens.js';
import { sendVerificationEmail } from '@/lib/email.js';
import { checkRateLimit } from '@/lib/rateLimiter';
import logger from '@/lib/logger';

function ackResponse() {
    return new Response(
        JSON.stringify({ message: 'If that email needs verification, we sent a new link.' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
}

export async function POST(request) {
    try {
        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;

        const { email } = body;
        if (!email) return createErrorResponse('Email is required', 400);

        const limited = await checkRateLimit('resend-verification', email.trim().toLowerCase());
        if (limited) return limited;

        const users = await sql`
            SELECT user_id, email, email_verified
            FROM app.login
            WHERE email = ${email.trim()}
        `;

        // constant-time: same work whether email exists or not
        const start = Date.now();
        const MIN_RESPONSE_MS = 500;

        if (users.length === 0 || users[0].email_verified === true) {
            // burn equivalent CPU time
            hashToken(generateSecureToken());
            const elapsed = Date.now() - start;
            if (elapsed < MIN_RESPONSE_MS) {
                await new Promise(r => setTimeout(r, MIN_RESPONSE_MS - elapsed + Math.random() * 100));
            }
            return ackResponse();
        }

        const user = users[0];
        const verificationToken = generateSecureToken();
        const tokenHash = hashToken(verificationToken);
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await sql`
            UPDATE app.login
            SET verification_token = ${tokenHash}, verification_token_expires = ${tokenExpires}
            WHERE user_id = ${user.user_id}
        `;

        await sendVerificationEmail(email.trim(), verificationToken);

        const elapsed = Date.now() - start;
        if (elapsed < MIN_RESPONSE_MS) {
            await new Promise(r => setTimeout(r, MIN_RESPONSE_MS - elapsed));
        }
        return ackResponse();
    } catch (error) {
        logger.error('resend verification error', { error });
        return createErrorResponse('Failed to resend verification email', 500);
    }
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/resend-verification/route.js && git commit -m "add resend-verification API endpoint with rate limiting"
```

---

### Task 10: Create Verify Email Page

**Files:**
- Create: `src/app/verify-email/page.jsx`

- [ ] **Step 1: Create the verify-email page**

Create `src/app/verify-email/page.jsx`:

```jsx
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Alert } from '@/components/alert'
import useI18n from '@/lib/notes/hooks/use-i18n'

function VerifyEmailContent() {
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const router = useRouter()

  const token = searchParams.get('token')
  const email = searchParams.get('email') || ''

  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const [resendMessage, setResendMessage] = useState('')
  const [resendLoading, setResendLoading] = useState(false)

  // auto-verify if token is in URL
  useEffect(() => {
    if (!token) return

    setVerifying(true)
    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (res.ok) {
          setVerified(true)
          setTimeout(() => router.replace('/notes'), 2000)
        } else {
          setError(data.error || t('Verification failed. The link may have expired.'))
        }
      })
      .catch(() => {
        setError(t('An error occurred. Please try again.'))
      })
      .finally(() => setVerifying(false))
  }, [token, router, t])

  const handleResend = async () => {
    if (!email) return
    setResendLoading(true)
    setResendMessage('')
    setError('')

    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (res.ok) {
        setResendMessage(data.message || t('Verification email sent. Check your inbox.'))
      } else {
        setError(data.error || t('Failed to resend verification email.'))
      }
    } catch {
      setError(t('An error occurred. Please try again.'))
    } finally {
      setResendLoading(false)
    }
  }

  // verifying state
  if (verifying) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center py-12 bg-background">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <h2 className="text-2xl font-bold text-text-secondary">{t('Verifying your email...')}</h2>
          <p className="mt-2 text-text-tertiary">{t('Please wait a moment.')}</p>
        </div>
      </div>
    )
  }

  // verified state
  if (verified) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center py-12 bg-background">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <Alert
            variant="success"
            title={t('Email verified!')}
            description={t('Your email has been verified. Redirecting to your notes...')}
          />
        </div>
      </div>
    )
  }

  // default: check your inbox (no token) or error (bad token)
  return (
    <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8 bg-background">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-text-secondary">
          {t('Check your email')}
        </h2>
        <p className="mt-2 text-center text-sm text-text-tertiary">
          {email
            ? t(`We sent a verification link to ${email}. Click the link to verify your account.`)
            : t('We sent a verification link to your email. Click the link to verify your account.')}
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]">
        <div className="bg-surface/50 px-6 py-12 outline -outline-offset-1 outline-white/10 sm:rounded-lg sm:px-12 space-y-6">
          {error && <Alert variant="error" description={error} />}
          {resendMessage && <Alert variant="success" description={resendMessage} />}

          {email && (
            <button
              onClick={handleResend}
              disabled={resendLoading}
              className="flex w-full justify-center rounded-md bg-primary-500 px-3 py-1.5 text-sm/6 font-semibold text-white hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendLoading ? t('Sending...') : t('Resend verification email')}
            </button>
          )}

          <p className="text-center text-sm text-text-tertiary">
            {t("Didn't receive the email? Check your spam folder.")}
          </p>
        </div>

        <p className="mt-10 text-center text-sm/6 text-text-tertiary">
          <Link href="/login" className="font-semibold text-primary-400 hover:text-primary-300">
            {t('Back to Login')}
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  const { t } = useI18n()
  return (
    <Suspense fallback={<div className="flex min-h-full items-center justify-center bg-background text-text-tertiary">{t('Loading...')}</div>}>
      <VerifyEmailContent />
    </Suspense>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds, `/verify-email` appears in the route list

- [ ] **Step 3: Commit**

```bash
git add src/app/verify-email/page.jsx && git commit -m "add verify-email page with auto-verify and resend flow"
```

---

### Task 11: Update /api/auth/me to Include email_verified

**Files:**
- Modify: `src/app/api/auth/me/route.js`

- [ ] **Step 1: Add email_verified to the fetchProfile query and response**

In `src/app/api/auth/me/route.js`, update the `fetchProfile` function. Change line 10:

Old:
```js
        sql`SELECT display_name, avatar_url, locale FROM app.login WHERE user_id = ${userId}::uuid`,
```

New:
```js
        sql`SELECT display_name, avatar_url, locale, email_verified FROM app.login WHERE user_id = ${userId}::uuid`,
```

And update the return on lines 14-19:

Old:
```js
    return {
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        locale: profile.locale,
        linkedProviders: providers,
    };
```

New:
```js
    return {
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        locale: profile.locale,
        emailVerified: profile.email_verified ?? true,
        linkedProviders: providers,
    };
```

The `?? true` fallback means OAuth users (who won't have this column set via the JWT session path) are treated as verified.

- [ ] **Step 2: Run tests**

Run: `npm run test:ci`
Expected: All tests pass

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/me/route.js && git commit -m "include email_verified in /api/auth/me response"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm run test:ci`
Expected: All tests pass (175 existing + 6 new token tests = 181 total)

- [ ] **Step 2: Run full build**

Run: `npx next build 2>&1 | tail -30`
Expected: Build succeeds. Route list should include:
- `/verify-email` (new)
- No `/reset-password/[token]` (deleted)
- No `/api/contact` (deleted)
- `/api/auth/verify-email` (new)
- `/api/auth/resend-verification` (new)

- [ ] **Step 3: Review all changes**

Run: `git log --oneline verify/email-auth-flows --not dev`
Expected: Clean commit history with ~10-11 commits
