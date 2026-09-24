# First-use HCI follow-up

> **Status:** Dated handoff; two incident causes remain unconfirmed
> **Recorded:** 2026-09-24

Commit `a9df3ae0` put the first-use feedback changes on `dev`. Local tests and a
disposable mock-stack walkthrough checked the changed flows. This does not
establish that either incident seen in the moderated session was fixed in a
live environment.

- **Verification email:** The participant did not find the message. The
  session evidence does not show whether Cloudflare rejected it, queued it,
  delivered it to another folder, or never received a send request. The app
  now classifies provider results and offers resend, but the original delivery
  outcome remains unknown. Investigate with redacted request ID, status code,
  timestamp, provider delivery state, and a controlled inbox. Do not record
  recipient addresses, message contents, or tokens.
- **Google sign-in:** The participant saw a 500. The failing request and root
  cause were not identified. The changed OAuth error path offers retry and
  support, but there is no evidence that the underlying failure was repaired.
  Correlate the request path, status, and timestamp with redacted application
  and provider logs before changing the callback or account state.

No production account state was changed for this handoff. The new welcome
column exists in the repository; this record does not prove that its migration
has run in any deployed environment.
