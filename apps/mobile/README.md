# OghmaNotes Android alpha

Status: initial native alpha, 2026-09-14. See [mobile engineering notes](../../docs/engineering/mobile-alpha.md) for supported flows, verification and release boundaries.

This is a separate Expo application. The existing Next.js website stays at the repository root. It has its own npm lockfile so native dependency versions do not change the web application's React version.

```sh
npm ci --prefix apps/mobile
npm run start --prefix apps/mobile
npm run typecheck --prefix apps/mobile
npm run test --prefix apps/mobile
npm run export:android --prefix apps/mobile
```

The default API is `https://oghmanotes.ie`. Set `EXPO_PUBLIC_API_URL=https://dev.oghmanotes.ie` before bundling to target development. Only HTTPS origins are accepted. This public setting contains no credentials. Native requests reuse the existing email/password login and session cookie; no server authentication changes are required.

## Build an installable APK

Install JDK 17 and Android command-line tools, accept the SDK licenses, and install the platform/build-tools/NDK versions required by the generated Expo project. Set `JAVA_HOME`, add its `bin` to `PATH`, and set `ANDROID_HOME` to the SDK location.

```sh
npm run build:apk --prefix apps/mobile
```

The script creates a dedicated private alpha signing identity on first use under `$XDG_DATA_HOME/oghmanotes-mobile`, falling back to `$HOME/.local/share/oghmanotes-mobile`. Keep that directory private and preserve it for future updates. Override its location with `OGHMA_ANDROID_SIGNING_DIR`. The build fails instead of replacing an incomplete signing identity. Never commit signing files or credentials.

Output: `apps/mobile/dist/oghmanotes-alpha.apk`. It is a release APK with bundled JavaScript and does not need Metro. The package identifier is `ie.oghmanotes.alpha`. Increment `android.versionCode` and the version in `app.json` for each distributed update. Android native files are generated and ignored.

## Stage the website download

After verifying the release APK:

```sh
node scripts/stage-mobile-apk.mjs
```

Run this command from the repository root. It stages the APK and its SHA-256 metadata under `public/downloads/`. The `/downloads` page only advertises the download when both files exist and their sizes match. It is linked only from the website footer and is noindex, not access-controlled. The APK contains no user credentials.

The APK is ignored by Git; its checksum manifest is tracked. Publish the APK as the `oghmanotes-alpha.apk` asset on the GitHub prerelease `android-alpha-v<version>`, then commit the manifest produced by the staging command. The website Docker build downloads this pinned release and verifies its size and SHA-256 before Next.js indexes public files. A missing or corrupt published artifact fails the build. This works with the existing server-managed Jenkins jobs without changing their definitions.

The same APK is served by dev and production and connects to the API origin it was built with. The manifest and release tag pin each website image to its APK, including rollbacks. A local copy of the published pair is retained at `/home/semyon/server-stacks/oghma/mobile-alpha`.

The template's original license is preserved in `LICENSE`. OghmaNotes code follows the repository's licensing.
