# Email Verification And Cleanup Spec

Status: historical design record.

## Intent

Require credentials users to verify email before using the app, while simplifying auth-related dead code.

## Decisions

- Add verification fields to `app.login`.
- Use shared token utilities for password reset and email verification.
- Registration sends verification email instead of creating a usable session immediately.
- Login rejects unverified credentials accounts.
- Add `POST /api/auth/verify-email` and `POST /api/auth/resend-verification`.
- Add `/verify-email` page.
- Remove unused reset/contact code paths.

## Security Notes

- Tokens must be hashed at rest and expire.
- Resend/verify routes must avoid account enumeration.
- Existing OAuth users need compatibility with the verified-email model.

## Verification

- New credentials users cannot log in until verified.
- Token expiry and resend behavior work.
- Password reset still works after token helper extraction.
