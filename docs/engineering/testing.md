# Testing and verification

> **Status:** Active engineering workflow
>
> **Last verified:** 2026-09-26 against `package.json`, Vitest configuration,
> local GitHub Actions workflow definitions; see the infrastructure runbook for deployment gates

Use this page to choose a check that proves the change you made. It describes
local verification; a CI run provides check evidence but does not by itself prove
that a branch requires the check.

## Fast checks

Run the smallest relevant test file while iterating:

```bash
npm run test -- --run src/__tests__/lib/validation.test.ts
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

The local workflow snapshot has separate test, lint, build, and E2E workflows.
It includes working-tree changes that are not evidence of deployed configuration. On pushes
and pull requests to `main` and `dev`, the test workflow runs
`npm run test:ci` (root and Canvas MCP Vitest suites); the lint workflow runs
ESLint, the i18n audit, and typechecking; and the build workflow runs
`npm run ci:deploy-contract` and `npm run build`. The E2E workflow also runs
integration contracts and the Playwright smoke suite on those pushes and pull
requests. Its full Playwright suite runs nightly and can also be selected with
`workflow_dispatch`.

Workflow triggers tell you when checks run; they do not establish that GitHub
requires those statuses before merging. As checked on 2026-09-26, the remote
repository has no classic branch protection for `main` and no repository
rulesets. Jenkins runs a separate deployment flow. The reviewed local job definitions
check app and worker health after deployment; they do not run the public
browser smoke suite. See the [homelab runbook](../../infra/HOMELAB.md) for
required check names and deployment gates.

Keep tests focused on observable contracts: response/status behavior, durable
state, ownership, provider-boundary requests, or race/failure handling. Avoid
asserting incidental helper calls unless ordering or a transaction boundary is
the behavior being protected.
