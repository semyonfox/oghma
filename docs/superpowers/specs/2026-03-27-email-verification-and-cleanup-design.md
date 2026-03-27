# Email Verification, Password Reset Cleanup, Contact Route Cleanup

Date: 2026-03-27
Branch: `verify/email-auth-flows`

## Overview

Three changes:
1. **Email verification (hard gate)** -- new users must verify their email before accessing the app
2. **Delete dead `reset-password/[token]/page.jsx`** -- unused duplicate with TODO'd backend call
3. **Delete unused `api/contact/route.ts`** -- backend route the frontend never calls

## 1. Email Verification (Hard Gate)

### Database Changes

Add 3 columns to `app.login`:

```sql
ALTER TABLE app.login
  ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN verification_token TEXT,
  ADD COLUMN verification_token_expires TIMESTAMPTZ;
```

Existing users should be marked as verified (they've already been using the app):

```sql
UPDATE app.login SET email_verified = true WHERE email_verified = false;
```

OAuth users are always considered verified (providers verify emails). The `email_verified` column only gates credential-based (email/password) accounts.

### Shared Token Utility

Extract common token logic used by both password reset and email verification into `src/lib/tokens.js`:

```js
generateSecureToken()        // crypto.randomBytes(32).toString('hex')
hashToken(rawToken)          // SHA-256 hex digest
verifyTokenHash(raw, stored) // hash raw, compare to stored (not constant-time needed since tokens are single-use)
```

Password reset routes (`request/route.js`) refactored to use these instead of inline crypto calls.

### Registration Flow Changes

File: `src/app/api/auth/register/route.js`

Current behavior: creates user, immediately creates session, user lands in app.

New behavior:
1. Create user with `email_verified = false`
2. Generate verification token via `generateSecureToken()`
3. Hash token, store hash + expiry (24 hours) in `verification_token` / `verification_token_expires`
4. Send verification email via SES (`sendVerificationEmail()`)
5. Do NOT create a session
6. Return `{ success: true, requiresVerification: true }`
7. Frontend redirects to `/verify-email`

### Login Flow Changes

File: `src/app/api/auth/login/route.js`

After successful password verification, check `email_verified`:
- If `false`: don't create session, return `{ requiresVerification: true, email: user.email }` with status 403
- If `true`: proceed as normal (create session)

Frontend login page handles 403 + `requiresVerification` by redirecting to `/verify-email` with the email as a query param (for resend).

OAuth login (via NextAuth) is unaffected -- OAuth users bypass this check entirely since providers verify emails.

### New API Endpoints

#### `POST /api/auth/verify-email`

Accepts: `{ token }`

1. Hash the incoming token
2. Query `app.login` for matching `verification_token` where `verification_token_expires > NOW()`
3. If no match: return error (invalid/expired token)
4. Set `email_verified = true`, clear `verification_token` and `verification_token_expires`
5. Create a session (auto-login after verification)
6. Return success

Rate limited: 10 attempts per hour per IP.

#### `POST /api/auth/resend-verification`

Accepts: `{ email }`

1. Look up user by email
2. If user doesn't exist or `email_verified = true`: return generic success (prevent enumeration)
3. Generate new token, hash, store, update expiry
4. Send new verification email
5. Return generic success message

Rate limited: 3 requests per hour per email (same as password reset).

Constant-time response (same pattern as password reset request -- pad response time to prevent timing-based enumeration).

### New Email Template

File: `src/lib/email.js`

Add `sendVerificationEmail(email, token)`:
- Subject: "Verify your email address"
- HTML template matching existing password reset style
- Link: `{baseUrl}/verify-email?token={token}`
- Text: "This link expires in 24 hours."

### New Page

#### `/verify-email` -- `src/app/verify-email/page.jsx`

Two states based on URL:

**No `?token=` param** (landed here after registration):
- "Check your inbox" message
- Show the email address if passed as `?email=` param
- "Resend verification email" button (calls `/api/auth/resend-verification`)
- "Back to login" link

**With `?token=` param** (clicked email link):
- Auto-submit token to `/api/auth/verify-email` on mount
- Show loading state, then success (redirect to `/notes`) or error
- On error: show "Resend" button

### `/api/auth/me` Changes

Include `email_verified` in the user response object. This is informational -- the hard gate is enforced at login time, not at `/me` time.

## 2. Delete Dead `reset-password/[token]/page.jsx`

Delete the entire directory `src/app/reset-password/[token]/`.

The email link in `src/lib/email.js:22` generates `/reset-password?token=xxx` (query param format). The working page at `src/app/reset-password/page.jsx` reads `searchParams.get('token')`. The `[token]` route variant has a TODO'd-out backend call and is never reached by actual reset emails.

## 3. Delete Unused Contact API Route

Delete `src/app/api/contact/route.ts`.

The frontend `src/components/contact-form.jsx` posts directly to `https://api.web3forms.com/submit` with the `NEXT_PUBLIC_WEB3FORMS_KEY`. The backend route validates and logs but the frontend never calls it. It provides no value.

## Files Changed Summary

### New files
- `src/lib/tokens.js` -- shared token utility
- `src/app/verify-email/page.jsx` -- verification page
- `src/app/api/auth/verify-email/route.js` -- verify token endpoint
- `src/app/api/auth/resend-verification/route.js` -- resend endpoint

### Modified files
- `src/app/api/auth/register/route.js` -- send verification email instead of creating session
- `src/app/api/auth/login/route.js` -- check `email_verified` before creating session
- `src/app/login/page.js` -- handle `requiresVerification` response
- `src/lib/email.js` -- add `sendVerificationEmail()` template
- `src/app/api/auth/me/route.js` -- include `email_verified` in response
- `src/app/api/auth/password-reset/request/route.js` -- refactor to use shared token utility

### Deleted files
- `src/app/reset-password/[token]/page.jsx` (and directory)
- `src/app/api/contact/route.ts`

## Security Considerations

- Verification tokens hashed before storage (SHA-256), same as password reset
- 24-hour expiry (longer than reset's 1hr since users may not check email immediately)
- Rate limiting on both verify and resend endpoints
- Constant-time responses on resend to prevent email enumeration
- OAuth users bypass verification (provider-verified)
- Existing users grandfathered as verified via migration
