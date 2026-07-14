# Performance Audit Findings

> **Status:** Dated audit evidence; first remediation pass completed on `dev`
>
> **Recorded:** 2026-07-14
>
> **Expanded:** 2026-07-15 with an external-PC constrained-mobile route audit

## Confirmed issues

- The production homepage LCP element is the header logo, which is currently lazy-loaded in `src/components/header.jsx`.
- The first blog card image is the blog page LCP element and is lazy-loaded in `src/app/blog/page.jsx`.
- The public syntax guide ships the interactive Markdown renderer and associated plugins, creating the highest measured public main-thread work and Total Blocking Time.
- `src/app/layout.js` imports KaTeX CSS and mounts application-only client surfaces globally, adding avoidable public-page CSS and JavaScript.
- `src/components/providers/I18nRootProvider.tsx` fetches `/api/settings` on unauthenticated pages and can attempt to parse an HTML response as JSON.
- `/calendar` nests action buttons inside a button day cell in `src/components/calendar/month-view.tsx`, producing a React hydration error in development.
- A fresh-context production run from the LAN PC found a repeatable CLS value of `0.2534` on three randomly selected existing notes. The shifted node was the main note content pane (`flex-1 overflow-auto bg-background`), which moved from a small centered area to the full workspace after initial paint.
- Under constrained-mobile conditions, the same three notes took `5.97-6.14s` to LCP, transferred `821-832KB` over 53 requests, accumulated `750-825ms` of long-task time, and produced `0.1301` CLS. This is the largest authenticated performance problem.
- `VSCodeLayout` fetches the selected note, then `MarkdownEditor` calls `fetchNote` again. External traces observed repeated `/api/notes/[id]` requests, while the editor's client-only chunk and loading placeholder arrive later and replace the initial pane.
- Three existing AI chats took `3.93-4.14s` to LCP and `426-665ms` of long-task time. Every historical assistant message eagerly uses the full GFM, math, raw HTML, sanitization, and KaTeX Markdown pipeline. The chat route's approximately `174KB` chunk took about `3s` to download under the audit profile.
- The syntax guide also ships an approximately `174KB` Markdown chunk. It recorded `736ms` of long-task time even though its content is static and can be rendered ahead of time.
- Quiz LCP was `2.95s`. Its initial dashboard remains behind client hydration and parallel dashboard/course API requests, although the individual APIs were fast.
- `/ai` and `/info` returned `404` in production. This is a deployment/routing defect rather than a rendering-performance result.

## Follow-up candidates

- **P0 - Notes:** establish one owner for note loading, pass the result into the editor, reserve the final workspace geometry during loading, and preload or server-render the editor shell. This targets duplicate requests, the worst LCP, and the CLS regression together.
- **P0 - Chat:** avoid eagerly parsing every historical message with the complete Markdown stack. Split optional code/math support, cache rendered output, and virtualize or incrementally render long transcripts.
- **P1 - Syntax guide:** pre-render its static Markdown with server components, MDX, or generated HTML instead of loading the interactive client renderer.
- **P1 - Quiz:** provide initial dashboard data from the server and use a final-shape loading shell rather than withholding the main content until client effects complete.
- **P1 - Shared shell:** move authenticated-only providers and global-search/Pomodoro clients out of the root public layout, gate the public `/api/settings` request, and review globally loaded font weights and KaTeX CSS.
- **P2 - Images:** make the homepage logo and first blog image eager/high-priority LCP candidates.
- **P2 - Settings:** defer or consolidate its profile, courses, avatar, Canvas, calendar, and vault request fan-out. Its `1.07s` LCP is acceptable, but `437ms` of long-task time and `0.0218` CLS leave room for improvement.
- **Correctness:** repair the calendar nested-button hydration error and the two production 404 routes before relying on their measurements.
- The mock environment files set `NODE_ENV=development`; a production audit build requires an explicit `NODE_ENV=production` override.

## Remediation pass

The first pass on 2026-07-15 made these bounded changes:

- removed the duplicate route-level note fetch and replaced the unstable loading label with a full-size editor skeleton;
- memoized completed chat bubbles and Markdown output so streaming updates do not reparse historical messages;
- replaced the syntax guide's client Markdown pipeline with static server-rendered semantic content;
- server-rendered the initial quiz dashboard and courses, removing its normal initial browser API requests;
- stopped public routes from revalidating authenticated settings and preloaded the homepage logo and first blog image;
- removed nested calendar buttons; and
- fixed `/info` endpoint placeholders being interpreted as translation variables. `/ai` and `/info` are both present in the production build, so any remaining deployed `404` after this pass indicates deployment drift.

The larger chat initial-bundle reduction, authenticated-only root-provider split, font/KaTeX review, settings request consolidation, and field telemetry remain follow-up work. Re-run the same external profile after deployment before recording performance improvements as achieved.

## Evidence

- Public Lighthouse mobile reports: `logs/lighthouse/2026-07-11-prod/`.
- Authenticated local production reports: `logs/perf/2026-07-14-private-production-mobile/`.
- External PC production audit: fresh Chromium contexts on the LAN loaded `/notes`, `/chat`, three random existing notes, and three existing chat sessions. All routes returned `200` without browser console errors. Note LCP was `1.12-1.17s`; chat-session LCP was `0.54-0.60s`; notes transferred about `806KB` and chats about `573KB` per fresh context. The visual check showed no clipping in the sampled note or chat. Private content, identifiers, and session tokens were not retained in this record.
- External PC development audit: the current dev Write/Beta note surface rendered its seeded Markdown note directly into heading, paragraph, list, and emphasis elements with no console errors. The dev test account had one deliberately simple note, so this verifies the renderer path but not complex imported Markdown, equations, tables, or image-heavy documents.
- External PC Chrome traces: ignored local evidence contains a fresh note Source load, a production Read-mode Markdown transition, and an existing chat load. The Read transition contained a longest `107ms` main-thread task, `47ms` script evaluation, and `36ms` layout. That is not a desktop saturation point, but it can become noticeable under mobile CPU throttling. Trace files may include private navigation metadata and must not be published.
- Comprehensive external-PC report: `logs/perf/2026-07-15-external-pc-full/report.json`. It covers 16 public routes, five authenticated route indexes, three randomly selected existing notes, all three existing chats, and one real Read-mode transition. Each route used a fresh Pixel 7-sized context, disabled cache, `4x` CPU slowdown, `150ms` latency, and approximately `1.6Mbps` download throughput. It is deterministic lab evidence, not field telemetry; use at least three repeated runs and medians for before/after acceptance.

## Overall assessment

The server and database are not the current limiting factors: constrained-run TTFB was generally `113-343ms`, and private API calls were usually `137-383ms`. Public legal/auth pages and authenticated indexes generally reached LCP in about `1.0-1.2s` under the same profile.

The `6s` note and `4s` chat LCP values are not a theoretical Markdown limit and are not reasonable targets. They are dominated by late client JavaScript, repeated data loading, eager parsing of existing content, and unstable loading geometry. The desktop Read-mode flame trace is modest; the problem appears when the same architecture is combined with a slower CPU and network. Use LCP below `2.5s`, CLS below `0.1`, and main-thread tasks below `50ms` as initial lab guardrails, then validate with field p75 telemetry.
