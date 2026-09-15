# Testing and verification

> **Status:** Active engineering workflow
>
> **Last verified:** 2026-09-13 against `package.json`, Vitest configuration,
> and GitHub Actions workflows

Use this page to choose a check that proves the change you made. It describes
local verification; CI remains the final branch-protection authority.

## Fast checks

Run the smallest relevant test file while iterating:

```bash
npm run test -- --run src/__tests__/lib/example.test.ts
```

For a repository-wide fast quality gate, run:

```bash
npm run lint:all
```

`lint:all` runs ESLint, the i18n audit, TypeScript 7 checks for the app and
Canvas MCP, the root Vitest suite (including TSX tests), and the Canvas MCP
Vitest suite. All first-party source and root tests under `src/` are
TypeScript/TSX. ESLint rejects explicit `any`; parse untrusted data as
`unknown` and narrow it at the boundary instead.
It does not start containers, run integration tests, or run Playwright.

The i18n audit parses source syntax instead of guessing with regular
expressions. It proves that literal `t(...)` keys exist in the base catalog,
every locale has the same string-key shape, and interpolation variables agree.
Catalog values passed dynamically (for example blog content) are valid runtime
usage and are not mislabeled as unused. Linguistic quality still needs a
native-language review; it is not something a static script can establish.

## Disposable-service checks

Integration and browser tests mutate their database and object-storage test
state. Use only the disposable services configured by `.env.e2e`; never point
these commands at a development or production environment.

```bash
cp .env.e2e.example .env.e2e
npm run e2e:services:up
npm run e2e:reset
npm run test:integration
# In a second terminal:
npm run e2e:worker
npm run e2e:smoke -- --workers=1
npm run e2e:services:down
```

`e2e:reset` intentionally clears the configured test database. The background
worker is required for streamed chat and other queued work. `e2e:worker` loads
the same `.env.e2e` files as Playwright, which keeps its database, Redis, queue
prefix, provider, and storage configuration identical to the app.
See the [chat runbook](../operations/chat.md) and
[import-worker runbook](../operations/import-worker.md).

## CI scope

The [test workflow](../../.github/workflows/test.yml) runs `npm run test:ci`,
which executes the root and Canvas MCP Vitest suites. The build workflow
installs with `npm ci`, runs ESLint and the i18n audit, then builds Next.js with
placeholder local service configuration. PR CI also runs integration contracts
and the Playwright smoke suite through the [E2E workflow](../../.github/workflows/e2e.yml),
using disposable services and a real background worker.
It runs for pull requests to `dev` or `main` and for pushes to `dev`. The larger
Playwright suite runs nightly or by manual dispatch.

Keep tests focused on observable contracts: response/status behavior, durable
state, ownership, provider-boundary requests, or race/failure handling. Avoid
asserting incidental helper calls unless ordering or a transaction boundary is
the behavior being protected.

## Dependency update constraints

Verified 2026-09-15 against the npm registry and local checks:

- Keep NextAuth on its current v5 beta line. Its npm `latest` tag still points
  to v4, which would be a downgrade. Keep Node typings on the supported runtime
  line rather than admitting Node 26 APIs into code that also runs on Node 22.
- Mobile uses Expo 57's recommended React, React Native, native modules and
  TypeScript versions. Run `npm exec -- expo install --check` from `apps/mobile`
  after updates. See the [Expo upgrade guide](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).
- Vitest 5 requires Vite as a peer. Both test packages list Vite explicitly so
  installation also works when npm's `legacy-peer-deps` setting is enabled.
- The root `lodash-es` override patches Mermaid/Chevrotain's pinned vulnerable
  copy. Mobile's scoped `xcode > uuid` override uses the patched CommonJS v11
  release. Recheck these overrides when the upstream packages update.
- React-PDF 11 uses PDF.js 6. Copy the matching `build/pdf.worker.mjs` from the
  `pdfjs-dist` package resolved by `react-pdf` into `public/pdf.worker.js` when
  upgrading. The worker-version regression prevents mismatched copied assets.
  `suspense={false}` preserves the viewer's loading/error UI.
- React-PDF 11 raises browser requirements to Chrome 125 and Safari 18, with
  additional compatibility work potentially needed below current browsers.
  See its [upgrade guide](https://github.com/wojtekmaj/react-pdf/wiki/Upgrade-guide-from-version-10.x-to-11.x).
  Mermaid 12 uses explicit `dagre` layout and `classic` look here to preserve
  existing diagrams' appearance.
