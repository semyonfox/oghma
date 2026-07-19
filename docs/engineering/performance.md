# Performance Auditing

> **Status:** Active guide with a known measurement caveat
>
> **Last reviewed:** 2026-07-11
>
> **Source of truth:** [`scripts/perf/audit-pages.mjs`](../../scripts/perf/audit-pages.mjs)

Use repeatable lab runs to compare code changes and field data to understand real-user experience. Do not treat a single local run as a production service-level result.

## Known caveat

A prior review suspected duplicate finished-request accounting. The current
source has one visible `requestfinished` handler, so duplication is not
established; however, the report totals have not been checked against a
controlled page with a known request count. Until that validation is recorded,
treat request counts, transferred bytes, API totals, and request-ranked
summaries as unverified.

Do not publish baselines or regression thresholds from those fields yet. Page navigation and paint timings can still help locate candidates, but compare the generated waterfall with browser DevTools and inspect `full.json` before drawing conclusions.

## Local lab run

Use a production build on a separate port:

```bash
npm run build
PORT=3312 npm run start
PERF_BASE_URL=http://127.0.0.1:3312 node scripts/perf/audit-pages.mjs
```

There is currently no `npm run perf:audit` package script. Invoke the file directly unless a package alias is added later.

Useful environment options:

```bash
# Include protected routes; the seeded E2E user must exist.
PERF_AUTH=1 PERF_BASE_URL=http://127.0.0.1:3312 node scripts/perf/audit-pages.mjs

# Repeat routes or use a mobile device profile.
PERF_ITERATIONS=3 PERF_DEVICE=mobile PERF_BASE_URL=http://127.0.0.1:3312 \
  node scripts/perf/audit-pages.mjs

# Audit an explicit comma-separated route set.
PERF_ROUTES=/notes,/chat,/quiz PERF_AUTH=1 PERF_BASE_URL=http://127.0.0.1:3312 \
  node scripts/perf/audit-pages.mjs

# Add routes to the script's defaults or choose an output directory.
PERF_EXTRA_ROUTES=/blog/example PERF_OUTPUT_DIR=logs/perf/manual \
  PERF_BASE_URL=http://127.0.0.1:3312 node scripts/perf/audit-pages.mjs
```

Other supported controls include `PERF_POST_LOAD_WAIT_MS` and `PERF_NAVIGATION_TIMEOUT_MS`.

## Outputs

Each run writes under `logs/perf/<timestamp>/` unless `PERF_OUTPUT_DIR` is set:

- `summary.md` — ranked pages and requests;
- `pages.csv` — page timing, paint, layout-shift, size, and error fields;
- `requests.csv` — request waterfall details;
- `full.json` — raw run metadata and observations.

Start with failed navigations and console/page errors. Then inspect TTFB, load,
FCP, LCP, CLS, long tasks, slow API calls, and large resources. Because of the
validation caveat, corroborate request-derived totals in Chrome DevTools.

## Field and server data

Production performance needs privacy-conscious real-user measurement for LCP, INP, CLS, FCP, and TTFB. Store route templates and build identifiers, not note content, request bodies, tokens, or sensitive raw URLs.

For slow APIs, time database, object-storage, AI, and external-service segments. `Server-Timing` headers make those boundaries visible in the browser waterfall. Field telemetry and server timing are proposed practices here; verify that collection and retention are implemented before describing them as live.
