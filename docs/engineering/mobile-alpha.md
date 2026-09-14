# Android alpha

> Status: Android alpha implementation; deployment uses the existing dev → main flow
>
> Last reviewed: 2026-09-14

The native application lives in [`apps/mobile`](../../apps/mobile/README.md). It uses Expo and React Native, with its own npm package and lockfile. The website and backend remain in the root Next.js application. Root TypeScript, ESLint and Docker configuration exclude generated native files and dependencies. This deliberately avoids moving the existing website into a workspace during the first port.

## Implemented flows

- Email/password, Google and GitHub sign-in and session restoration using the existing API. The returned session cookie lives in Expo SecureStore and is sent only to the configured HTTPS origin. Requests reject redirects and bypass the ambient cookie jar. Passwords are not persisted.
- Folder browsing, filtering within a folder, note creation, Markdown reading and plain Markdown editing. Saves update the same notes as the website. Drafts are stored locally, keyed by user and note, and offered for recovery when reopening a note.
- A pre-save comparison checks whether another device changed the note. This is a best-effort conflict warning, not atomic optimistic concurrency. The existing update endpoint has no version precondition, so simultaneous saves can still race. Avoid concurrent editing of the same note in this alpha.
- PDF/text uploads through the existing import endpoint. Uploads appear at the root, including when initiated inside a folder. Extraction stays on the worker. Original files stream through the authenticated upload endpoint into an account-scoped cache and open through Android's file viewer, with a share chooser fallback. Cached files and drafts are cleared on explicit logout.
- Chat history, new conversations, note-scoped conversations, background generation, streamed text, stop, and reconnect. Backgrounding closes the stream; foregrounding replays it. Reopening a conversation after process death discovers its active generation from the backend. Persisted messages replace transient streamed text after completion.
- A footer-linked `/downloads` website page with APK download availability and checksum. Hosting instructions live in the mobile README.

## In-app updates

App updates are available before sign-in and in Account. A quiet notice announces a newer Android version. Checking happens on startup and at most every 30 minutes when returning to the app. Downloading requires a tap and shows progress, cancellation and retry. Navigation does not interrupt the download. Process death requires a fresh download.

Updates always use the production HTTPS download endpoint, independently of the configured account API. The native module streams into private cache storage and checks size, SHA-256, package identity, versionCode and the existing signing certificate before handing the APK to Android. Installation uses a read-only content URI and Android confirmation. On Android 8 and later, the user first grants OghmaNotes permission to install apps from this source. Returning from settings keeps the download ready; it never starts installation automatically. A cancelled installer can be reopened.

Version 0.1.2 is the first build with the updater. Earlier installations need one manual APK update. The release signing identity and package stay the same.

## Limits

This is not feature parity with the website. Calendar, quizzes, rich text editing, native PDF annotation, notification delivery, offline library sync and silent APK installation are not implemented. Mathematics and diagrams do not yet match the web renderer. Internal note/citation links do not yet navigate within the native reader. The app uses English and matches the website’s Source Sans 3/Source Serif 4 typography, indigo/slate palette, Markdown colours, and light/dark/system theme settings. Theme changes sync through the existing account settings endpoint.

The app does not send browser-presence heartbeats. It uses the backend's existing background-job endpoints; the existing user-wide presence cancellation policy can still affect a generation if another browser tab established presence and then disappears. Changing that policy is separate backend work.

The website's existing authentication policy remains intact. Session expiry returns to login while preserving account-scoped drafts for recovery after signing in again. Explicit logout removes the local session and drafts, not a server-side revocation record, matching the current stateless JWT design.

## Verification and release

Run mobile type checking, contract tests and Android bundling. Run root type checking, lint for changed files and `src/__tests__/lib/mobile-release.test.ts`. Build and inspect a signed, non-debuggable APK before staging it.

Local verification on 2026-09-14 passed root and mobile TypeScript checks, seven native contract tests, four download-artifact tests, changed-file ESLint and all 21 Expo Doctor checks. The release APK was checked for its package/version, release signature and 16 KB ZIP alignment. The download page was checked at 390 px and 1280 px widths with no horizontal overflow.

Version 0.1.2 passed root and mobile TypeScript checks, 17 native tests, four download-artifact tests, changed-file ESLint, and a signed release build. The APK retains the existing signing certificate and package, declares the install permission, and passes 16 KB ZIP alignment.

Device acceptance still requires testing email login, cold relaunch, nested folders, draft recovery, saving and observing the result on the website, file upload/viewer handoff, long Markdown notes, keyboard/back handling, streamed chat, stop and lock/resume. Use a test account before relying on the alpha for real editing. A successful build does not prove these interactions work on a physical phone.

The APK is a release artifact. Its version and checksum manifest are tracked so website images fetch a pinned, verified APK. `/downloads` is not private authentication. Do not put credentials in the bundle or use an obscure URL to protect sensitive data.

## Browser sign-in handoff

Google and GitHub use the existing Auth.js browser providers and account linking, without new provider credentials or callback registrations. The app opens an external browser and keeps a random verifier in SecureStore across process restarts. The browser confirms its Auth.js account, then issues a 120-second, single-use Redis grant bound to the verifier’s SHA-256 challenge. Only the code and state return through `ie.oghmanotes.alpha://auth`; the session cookie is issued over HTTPS after atomic redemption and an active-account check. A wrong verifier does not consume the grant. There is no in-memory fallback when Redis is unavailable.

The browser identity is deliberately resolved through Auth.js rather than a potentially different email/password cookie. Grant keys are isolated between deployment environments. The existing website sign-in policy and provider callback URLs are unchanged.

## References

- [Expo project setup](https://docs.expo.dev/get-started/create-a-project/)
- [Expo fetch and streaming](https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Local native builds](https://docs.expo.dev/guides/local-app-development/)

## Design review

Claude Opus reviewed the native source and a rendered download-page screenshot on 2026-09-14. It identified chat scrolling and Back navigation, Android keyboard space, long-note editing, new-note entry, stale draft recovery, session-expiry messaging, version display and small-text contrast as alpha issues. Those findings were accepted and addressed. Draft cleanup waits for the recovery decision, so the stale-draft fix cannot erase a recoverable draft during initial loading.

The download page was rendered at phone and desktop widths. Native keyboard and layout findings remain source-based until a physical Android test. The proposed font-scaling cap was rejected in favour of wrapping action rows. Full rich editing and conflict merging remain later work.

A fresh Claude Sonnet pass found no remaining blockers in the revised source. Its unmount-guard suggestion was also applied. Native keyboard behaviour still needs a physical-device check; the generated Android manifest uses `adjustResize`.
