# Canvas Export CLI Handoff

> Status: Historical scoped design; standalone CLI not implemented
>
> Audience: A future maintainer deciding whether to extract the exporter
>
> Recorded: 2026-07-09
>
> Verified against the repository: 2026-07-11

This handoff captures a possible standalone Canvas archive exporter. It is not
an installation guide, released package, supported command, or current roadmap
commitment.

## Proposed Outcome

A separate command-line tool would accept a Canvas host, a user API token, and
an output path, then create one zip containing the files and Canvas-native
content visible to that token.

The standalone tool should not depend on OghmaNotes authentication, its
database, object storage, embeddings, OCR, or note creation.

## Existing Building Blocks

The repository already contains a working in-app archive path:

| File | Current role |
|---|---|
| `src/app/api/canvas/download/route.js` | Authenticated OghmaNotes route; discovers all visible courses or accepts selected course descriptors |
| `src/lib/canvas/raw-export.js` | Discovers Canvas metadata/content, records restricted endpoints, downloads files, and streams a zip |
| `src/lib/canvas/client.js` | Canvas client, pagination, arbitrary-path reads, and file downloads |
| `src/__tests__/api/canvas-download.test.ts` | Route coverage for selected and auto-discovered courses |
| `src/__tests__/lib/canvas-raw-export.test.ts` | Archive discovery and output coverage |
| `src/lib/canvas-mcp/` | Broader endpoint inventory; not the archive engine |

The in-app archive includes a machine-readable manifest, a human-readable
summary, generated JSON/Markdown content, and available binary downloads.
Restricted or unavailable endpoints are recorded rather than aborting the
whole export.

## Scope Boundary

“All Canvas content” means content exposed by the Canvas API to the supplied
user token. It does not include hidden, deleted, admin-only, or external
LTI-hosted material unless Canvas exposes it and supplies a retrievable URL.

The archive must preserve partial-failure reporting. It must not imply that a
successful run is a legal records export or a complete institution backup.

## Suggested Extraction Shape

If this work is approved, start with a small TypeScript package and adapt the
existing client and raw exporter. Preserve the current archive manifest and
summary before adding features.

Candidate capabilities:

- select all visible courses or repeat a course selector;
- choose the output path;
- show progress without printing the token or authenticated URLs;
- set bounded request timeouts;
- skip expensive categories such as conversations or groups;
- produce a metadata-only diagnostic archive;
- resume or report partial failures without silently dropping content.

Keep requests conservative initially. The in-app exporter traverses endpoints
sequentially and a large account can require thousands of requests. Add bounded
concurrency only after correctness, rate-limit behavior, retry policy, and
archive determinism are tested.

## Work Still Required

- Choose whether the tool lives in this repository or a separate repository.
- Define token input that avoids shell history, process listings, logs, and
  crash reports.
- Define supported Node version, packaging, release, checksums, and ownership.
- Decide progress, cancellation, timeout, retry, and resume semantics.
- Validate archive behavior against small and large accounts without storing
  real credentials in fixtures.
- Add explicit rate-limit handling and safe handling of pre-authenticated
  download URLs.
- Document the difference between the in-app authenticated route and the
  standalone token-based tool.
- Complete a privacy and security review before distribution.

Until those items are implemented and released, refer users to the in-app
Canvas archive feature rather than presenting a `canvas-export` command as
available.
