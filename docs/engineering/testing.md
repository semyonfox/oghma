# Testing and verification

> **Status:** Active engineering workflow
>
> **Last verified:** 2026-08-12 against `package.json`, Vitest configuration,
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
npm run e2e:smoke -- --workers=1
npm run e2e:services:down
```

`e2e:reset` intentionally clears the configured test database. Start the
background worker separately when a scenario needs queued import or indexing
work; see the [import-worker runbook](../operations/import-worker.md).

## CI scope

The GitHub test workflow runs `npm run test:ci`, which executes the root and
Canvas MCP Vitest suites. The build workflow installs with `npm ci`, runs
ESLint and the i18n audit, then builds Next.js with placeholder local service
configuration. Docker-backed integration and Playwright suites are deliberate
local/release checks, not GitHub Actions defaults.

Keep tests focused on observable contracts: response/status behavior, durable
state, ownership, provider-boundary requests, or race/failure handling. Avoid
asserting incidental helper calls unless ordering or a transaction boundary is
the behavior being protected.
