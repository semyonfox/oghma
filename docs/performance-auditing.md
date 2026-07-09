# Performance Auditing

Use two kinds of data when tracking app speed:

1. Lab data from repeatable browser runs. This is best for comparing branches and finding slow pages, large assets, render-blocking work, and slow request waterfalls.
2. Field data from real users. This is best for knowing whether production users actually see slow LCP, high INP, layout shift, or slow API calls on their own devices and networks.

## Local Lab Audit

Run the audit against a production build when you need trustworthy page-load numbers:

```bash
npm run build
PORT=3312 npm run start
PERF_BASE_URL=http://127.0.0.1:3312 npm run perf:audit
```

The default command audits public pages and writes reports under `logs/perf/<timestamp>/`.

Useful options:

```bash
# Include protected app pages. Requires the seeded E2E user to exist.
PERF_AUTH=1 PERF_BASE_URL=http://127.0.0.1:3312 npm run perf:audit

# Run the same routes multiple times.
PERF_ITERATIONS=3 PERF_BASE_URL=http://127.0.0.1:3312 npm run perf:audit

# Mobile viewport.
PERF_DEVICE=mobile PERF_BASE_URL=http://127.0.0.1:3312 npm run perf:audit

# Explicit routes, including dynamic pages with real IDs.
PERF_ROUTES=/notes,/notes/<note-id>,/chat,/quiz PERF_AUTH=1 npm run perf:audit

# Add routes to the default route list.
PERF_EXTRA_ROUTES=/blog/my-post,/notes/<note-id> PERF_AUTH=1 npm run perf:audit
```

Output files:

- `summary.md`: slowest pages, slowest requests, largest requests.
- `pages.csv`: sortable page-level metrics such as TTFB, FCP, LCP, CLS, request count, transferred KB, and slowest request.
- `requests.csv`: sortable request waterfall with status, type, duration, and response size.
- `full.json`: complete raw data for deeper analysis.

## What To Investigate First

Prioritize pages by `loadMs`, `lcpMs`, `apiTotalMs`, `totalResponseKb`, and `slowestRequestMs` in `pages.csv`.

Then use `requests.csv` to identify whether the page is slow because of:

- slow document response or high TTFB,
- slow `/api/*` requests,
- large JavaScript bundles,
- large images or PDFs,
- slow fonts/stylesheets,
- failed or repeated requests.

Use Chrome DevTools Performance for the worst pages after the CSV pass. The script finds where to look; DevTools explains main-thread work, render blocking, layout shifts, and hydration cost.

## Production Field Data

For production, add real-user monitoring rather than relying only on local audits. In Next App Router, a small client component using `useReportWebVitals` can send LCP, INP, CLS, FCP, and TTFB to an internal endpoint. Store route, metric name, value, rating, device hints, and build/version. Do not store note content, request bodies, tokens, or raw sensitive URLs.

The useful production dashboard is P75 by route, split by desktop/mobile and authenticated/public pages. The key targets are LCP under 2.5s, INP under 200ms, and CLS under 0.1 at the 75th percentile.

## Server/API Timing

For slow API routes, add server timing around database queries, storage calls, AI calls, and external services. Emit `Server-Timing` headers where possible so the browser waterfall shows whether time was spent in the app server, database, cache, object storage, or upstream APIs.
