# Email Verification And Cleanup Plan

Status: historical implementation record.

## Goal

Add hard-gated email verification for credentials registration, share token utilities with password reset, and delete unused auth/contact code paths.

## Scope

- Delete dead reset/contact routes that were no longer used.
- Add shared token generation and hashing helpers.
- Refactor password reset to use the shared token utility.
- Add verification email template.
- Add database fields for `email_verified`, verification token, and expiry.
- Change registration so new users verify before receiving an active session.
- Block login for unverified credentials users.
- Add verification and resend API routes.
- Add `/verify-email` page.
- Include `email_verified` in `/api/auth/me`.

## Key Files

| Area | Files |
|---|---|
| Auth routes | `src/app/api/auth/register/route.js`, `login/route.js`, `verify-email/route.js`, `resend-verification/route.js`, `me/route.js` |
| Tokens/email | `src/lib/auth/*`, `src/lib/email*` |
| UI | `src/app/verify-email/page.jsx` |
| Schema | login table migration adding verification columns |

## Verification

- New credentials registrations cannot log in until verified.
- Verification token expiry is enforced.
- Resend flow issues a new token without leaking account state.
- Password reset still works after token utility extraction.
- OAuth users remain compatible with the verification model.
