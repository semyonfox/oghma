# Canvas Export CLI Handoff

Last updated: 2026-07-09

## Primary Goal

Build an easy standalone CLI for exporting all Canvas files and user-visible Canvas content from a Canvas API token.

Desired command shape:

```bash
canvas-export \
  --domain universityofgalway.instructure.com \
  --token '...' \
  --out canvas-export.zip
```

The tool should:

- Require only a Canvas domain and user API token.
- Discover all courses visible to that user.
- Export all user-accessible Canvas files and relevant Canvas-native content.
- Produce one local zip archive.
- Avoid OghmaNotes auth, DB, S3/R2, embeddings, OCR, or note creation.
- Be easy to share/run. TypeScript is the fastest path because the working implementation is already in this repo, but Go/Rust/Zig would be fine later if a neat static binary is preferred.

## Repo Context

Main repo:

```text
/home/semyon/code/university/ct216-software-eng/oghmanotes
```

This repo is OghmaNotes, a Next.js study app for university students. It supports notes, PDFs, search/RAG, quizzes, assignments, and Canvas LMS integration. The existing Canvas integration imports Canvas content into OghmaNotes for processing/indexing. During this thread, a separate read-only Canvas archive export path was added that streams a zip instead of embedding content or saving to object storage.

Canvas MCP server:

```text
/home/semyon/code/university/ct216-software-eng/oghmanotes/src/lib/canvas-mcp
```

The Canvas MCP server wraps Canvas REST API endpoints as MCP tools. It is useful as endpoint inventory and agent-accessible Canvas tooling, but it does not currently create a zip export by itself.

## Implemented In OghmaNotes

New app export route:

```text
src/app/api/canvas/download/route.js
```

- `POST /api/canvas/download`
- Requires an authenticated OghmaNotes session and saved Canvas credentials.
- Body `{}` means all discoverable courses.
- Body `{ courseIds: [...] }` means selected courses.
- Streams `canvas-export-YYYY-MM-DD.zip`.

New exporter:

```text
src/lib/canvas/raw-export.js
```

It builds a zip containing:

- `_canvas-export-manifest.json`
- `_canvas-export-summary.txt`
- account profile/settings/activity/todo/upcoming/events
- user files
- conversations and attachments
- course files/folders/modules/pages/announcements/discussions
- assignments, submissions, submission attachments
- quizzes, submissions, and questions where accessible
- grades/enrollments/rubrics
- groups, group files/discussions/media
- media objects/attachments, collaborations, and content exports where accessible

Restricted/unavailable Canvas endpoints are recorded in `_canvas-export-summary.txt` instead of failing the whole export.

Canvas client additions:

```text
src/lib/canvas/client.js
```

- `getPath(path)`
- `getPaginatedPath(path)`

UI addition:

```text
src/components/settings/canvas-integration.jsx
```

- Added `Download full Canvas archive`.
- No selected courses means all discoverable courses.

Tests added:

```text
src/__tests__/lib/canvas-raw-export.test.ts
src/__tests__/api/canvas-download.test.ts
```

Validation already run:

```bash
npm run test -- --run src/__tests__/lib/canvas-raw-export.test.ts src/__tests__/api/canvas-download.test.ts
npx eslint src/__tests__/lib/canvas-raw-export.test.ts src/__tests__/api/canvas-download.test.ts src/lib/canvas/raw-export.js src/app/api/canvas/download/route.js src/components/settings/canvas-integration.jsx src/lib/canvas/client.js
npm run build
```

All passed.

## Real Canvas Probe

A stored Canvas credential in the dev database was tested without printing the token.

Confirmed:

- Token decrypted and authenticated.
- Canvas profile probe worked.
- Canvas returned a user id.
- 20 active courses were discovered.
- A metadata-only traversal reached thousands of Canvas API requests.
- The traversal touched files, modules, discussions, assignments, submissions, quizzes, and groups.
- The run was stopped by request before final zip generation.

Conclusion: the exporter should work for all user-accessible Canvas content, but a full account export is slow because it walks many Canvas endpoints. A standalone CLI should show progress and should probably support timeouts and optional skip flags.

## Canvas MCP Details

Canvas MCP path:

```text
src/lib/canvas-mcp
```

Run from README:

```bash
cd src/lib/canvas-mcp
npm install
npm run build
CANVAS_DOMAIN=universityofgalway.instructure.com \
CANVAS_API_TOKEN='...' \
npm start
```

It can also receive credentials per request:

- `X-Canvas-Token`
- `X-Canvas-Domain`

Tool areas include:

- courses
- files/folders
- modules
- pages
- announcements
- discussions
- assignments/submissions
- quizzes
- calendar/planner/todo
- grades/enrollments
- rubrics
- conversations/messages
- profile/settings
- notifications/activity stream

Use these MCP tools as endpoint reference when shaping the CLI, but base the actual zip export primarily on `src/lib/canvas/raw-export.js`.

## Recommended CLI Plan

Create a standalone package, for example:

```text
tools/canvas-export-cli/
```

or split it into its own repo.

Suggested TypeScript structure:

```text
src/index.ts
src/canvas-client.ts
src/raw-export.ts
src/zip.ts
package.json
```

Copy/adapt from:

```text
src/lib/canvas/client.js
src/lib/canvas/raw-export.js
src/lib/canvas-mcp/src/tools/*
```

Initial CLI:

```bash
canvas-export --domain <domain> --token <token> --out ./canvas-export.zip
```

Good flags:

- `--course <id>` repeatable
- `--metadata-only`
- `--timeout-ms 20000`
- `--progress`
- `--skip-conversations`
- `--skip-groups`
- `--verbose`

Implementation note: the current exporter uses sequential Canvas requests. That is safer for Canvas rate limits but slow on large accounts. Keep the first CLI conservative, then add bounded concurrency only after validating correctness.

## Important Behavioral Boundary

"All files related to a user" means all files/content Canvas exposes to that user token via the Canvas API. It cannot export hidden, deleted, admin-only, or externally hosted/LTI content unless Canvas exposes it and provides a downloadable URL. Those cases should be logged in the summary file.
