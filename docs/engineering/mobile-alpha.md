# Android alpha

> Status: full web workspace in a React Native Android shell, version 0.1.3
>
> Last reviewed: 2026-09-14

The Android application lives in [`apps/mobile`](../../apps/mobile/README.md), with its own npm package and lockfile. Version 0.1.3 replaces the limited native notes/chat screens with the existing Next.js website in React Native WebView. The website remains at the repository root. Its responsive navigation, Milkdown rich editor, PDF.js renderer, chat, calendar, quizzes and settings are used directly inside the app.

## Workspace and themes

The app opens `/notes` on `https://oghmanotes.ie`, or the development origin selected when bundling. The app opens directly into notes or sign-in. App logos return to notes or login, with no marketing homepage in the app flow. Workspace navigation remains inside the app. External web links open through Android. PDFs opened from the notes library render inside the existing viewer using authenticated bytes from the same-origin upload API; they do not launch a separate PDF application. The viewer mounts pages near the scroll position, releases offscreen canvases and caps canvas pixel density at 2.

The website owns typography, appearance and account theme persistence. A small native bridge reports its resolved light/dark theme to the Android status bar, loading/error screens and update sheet. Outside the Android app, the bridge has no visible UI. The APK still needs updating when native capabilities change; web interface fixes arrive with website deployments.

## Authentication

Email/password sign-in uses the website form and ordinary WebView cookies. Google and GitHub use the existing Auth.js browser providers and account linking. The provider buttons send only the provider name to the native shell, which opens the existing external-browser OAuth flow. This keeps provider sign-in outside the embedded browser.

The browser handoff keeps a random verifier in SecureStore across process restarts. A 120-second single-use Redis grant is bound to its SHA-256 challenge. Only the code and state return through `ie.oghmanotes.alpha://auth`. HTTPS redemption issues the session after an active-account check. The dedicated native web-session module installs that cookie with HttpOnly, Secure and SameSite attributes in Android CookieManager and flushes it before opening the workspace. Session cookies never pass through page JavaScript or URLs.

An existing alpha session transfers to the WebView once. The old SecureStore session is removed only after successful transfer, preventing an old native session from signing the user back in after website logout. Previous native draft keys remain on the device; the web editor does not import those drafts. New edits use the website's existing save and recovery behaviour.

Native cookie installation accepts only the exact production and development HTTPS origins. Native bridge messages are limited to Google/GitHub sign-in, the update screen and resolved light/dark theme. The shell checks each message's source origin and payload before acting. File/content/intent/JavaScript navigation is blocked.

## In-app updates

Updates are available on login and in Settings inside the app. A quiet notice announces a newer Android version. Checks happen at startup and at most every 30 minutes on foregrounding. Downloading requires a tap and supports progress, cancellation and retry without interrupting the workspace.

Updates always use the production HTTPS download endpoint. The native updater streams into private cache and checks size, SHA-256, package, versionCode and signing identity before offering installation through a read-only content URI. Android requires confirmation and may first require permission to install apps from OghmaNotes. Returning from permission settings never starts installation automatically. A cancelled installer can be reopened. Process death requires a fresh download.

Version 0.1.2 was the first build with the updater. Earlier installations need a manual APK update. The package and release signing identity stay the same. The downloads page remains linked only from the website footer.

## Limits and verification

The web workspace requires a connection for initial loading and sync. This does not add offline library sync, native notifications or silent installation. Rendering and keyboard behaviour depend on Android System WebView. Browser viewport tests cannot establish physical-device keyboard, OAuth return or APK installer behaviour.

For a release, run mobile type checking and contract tests, root type checking and focused web tests, then build and inspect a signed non-debuggable APK. Verify editor input/save, inline PDF canvases, light/dark themes and phone-width overflow with rendered browser evidence. Check the APK package, version, signing certificate, declared permissions and 16 KB alignment before staging.

Version 0.1.3 passed the signed Android build, mobile TypeScript and 24 mobile contract tests, root production build and focused authentication/PDF/bridge tests. Browser checks at 390 × 844 pixels verified real editor input and save requests, inline PDF rendering, zoom, theme messages, sign-in/update actions and no page overflow or marketing homepage links. A 24-page PDF retained three canvases near the beginning and end, releasing the first canvas after scrolling. APK package/version, existing signing certificate and 16 KB alignment passed. These tests used synthetic browser fixtures, not a physical Android device.

The APK is a release artifact. Its checksum manifest is tracked and website images fetch the pinned, verified GitHub release. `/downloads` is noindex, not private authentication. Build, signing and hosting instructions are in the [mobile README](../../apps/mobile/README.md).

## References

- [React Native WebView guide](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md)
- [React Native WebView reference](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md)
- [Expo browser authentication](https://docs.expo.dev/versions/latest/sdk/webbrowser/)
- [Local native builds](https://docs.expo.dev/guides/local-app-development/)
