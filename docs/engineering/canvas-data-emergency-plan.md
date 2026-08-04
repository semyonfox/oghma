# Canvas Data Emergency Plan

> **Status:** Contingency design; not implemented and not an executable runbook
>
> **Last reviewed:** 2026-07-25
>
> **Source of truth for:** The response options if OghmaNotes must reduce or
> stop retaining Canvas-originated content

This plan defines how OghmaNotes could move from its current materialised
Canvas library to a reduced-retention mode. It exists for an institutional,
legal, security, capacity, or provider-policy constraint. It does not assert
that the current storage model is unlawful or uneconomic.

No retention switch currently exists. Do not respond to an incident by
manually deleting object prefixes or shared-cache rows. Implement and verify
the selected mode first, then run a reference-aware cleanup.

## Current Data Boundary

Normal Canvas import is narrower than a full Canvas account archive. It stores
supported module files and assignment attachments selected through course
import, plus assignment metadata. The separate Canvas archive endpoint streams
its ZIP response to the user with `Cache-Control: no-store`.

Current persisted representations are:

| Data | Current owner | Current behaviour |
|---|---|---|
| Imported PDF binary | S3-compatible storage | One SHA-256-addressed shared object can serve several user-owned references |
| Other imported binaries | S3-compatible storage | Stored under a user/course import path |
| Extracted Markdown and text | PostgreSQL notes and imported-file cache | Retained for editing, keyword search, export, and cache replay |
| Chunk text | PostgreSQL chunks and imported-file cache chunks | Retained so vector results can be hydrated into cited text |
| Embeddings | Qdrant | User-scoped points plus a canonical imported-file cache set |
| Marker image assets | S3-compatible storage | User-note assets and cache-owned shared assets may both exist |
| Assignment data | PostgreSQL `app.assignments` | Canvas fields are fetched during import or explicit assignment sync and upserted locally |
| Study calendar | PostgreSQL `app.time_blocks` | Oghma-owned blocks, optionally linked to a local assignment |
| Canvas calendar, planner, and todo reads | Canvas API through the hosted MCP | Fetched live when a chat tool requests them; not mirrored into the Oghma calendar |
| Canvas-informed chat answers | PostgreSQL chat tables | The raw MCP result is not a standalone cache, but the resulting assistant answer is durable chat content |

Canvas import and assignment sync use the Canvas client directly. The hosted
Canvas MCP is a request-time chat/tool bridge, not the persistence layer for
imports or the local planner.

## Emergency Modes

Choose the least disruptive mode that satisfies the actual constraint. The
incident owner must record the affected data classes, users, environments,
deadline, and authority for the change.

### Mode 0 — Retain Current Library

Keep originals and derived representations. Use this when the issue can be
addressed through capacity, encryption, access control, or a bounded retention
policy without changing the product contract.

This preserves independent PDF viewing, annotations, exact vault export,
re-extraction, and access after a Canvas course or token becomes unavailable.

### Mode 1 — Retain Derived Study Data, Fetch Originals Live

Download an original into transient processing storage, extract it, then
delete the transient object after every terminal success, failure, or
cancellation path. Retain:

- Canvas tenant, file ID, version token, byte size, MIME type, and provenance;
- extracted Markdown/text required by the note experience;
- chunk text and vectors required by search and cited chat;
- assignment metadata and Oghma study blocks;
- an explicit record that the original is remote-only.

When a user opens or exports an original, request fresh file metadata from
Canvas by ID and stream a newly authorised download. Do not treat a previously
returned Canvas download URL as durable.

Expected degradation:

- original viewing and export fail when the token is revoked, the course is
  closed, permissions change, or Canvas is unavailable;
- annotations cannot render until the same source document is obtained;
- later OCR or extraction upgrades require another Canvas download;
- an imported library is no longer a permanent independent copy of the
  original course files.

This is the preferred emergency mode when the constraint concerns original
course-file retention but permits derived student notes and search data.

### Mode 2 — Metadata And On-Demand Materialisation

Retain only course/file/assignment locators and lightweight planner metadata
until a student explicitly opens, processes, or pins an item. Derived content
may be temporary or retained under a separate, explicit purpose.

This minimises server storage but makes search completeness, first-answer
latency, background study generation, offline use, and provider independence
substantially worse.

### Mode 3 — Explicit Vault Pinning

Combine Mode 1 or 2 with a user action such as **Keep original in my vault**.
Pinned objects use the normal durable-storage policy; unpinned objects remain
remote-only. The UI must show the distinction before import and beside each
file.

This is the preferred long-term hybrid if users need an independent vault but
default original retention must be minimised.

## Required Implementation Before Activation

An emergency mode is safe only after all of the following exist:

1. **One policy boundary.** Introduce a tested retention policy used by Canvas
   import, retry, Marker, note viewing, sharing, vault export, note deletion,
   vault deletion, and account erasure. Do not scatter unrelated environment
   checks through those paths.
2. **Complete source locators.** Store tenant, external file ID, version token,
   size, and MIME type for every supported remote-only file. The current
   imported-file source cache is PDF-focused and is not sufficient evidence
   for all formats.
3. **Transient Marker lifecycle.** Async Marker work requires the source to
   remain reachable until callback, failure, timeout, or cancellation.
   Transient objects therefore need explicit expiry and terminal cleanup, not
   deletion immediately after dispatch.
4. **Live-fetch endpoint.** Authorise every request against the current user,
   obtain fresh Canvas metadata, stream without durable caching, and report a
   clear unavailable state. A content hash match should be required before
   applying existing annotations to a redownloaded file.
5. **Product states.** Distinguish `retained`, `remote-only`,
   `temporarily-unavailable`, `access-lost`, and `source-changed`. Do not show a
   remote-only item as safely backed up.
6. **Export contract.** Define whether vault export omits unavailable
   originals, fails, or includes a manifest of missing remote files. Never
   silently produce an apparently complete archive.
7. **Version-aware sync.** Current completed-file handling is effectively
   Canvas-file-ID deduplication. Remote-only operation requires detection of a
   changed version under the same Canvas file ID.
8. **Retention inventory.** Measure original objects, derived assets, cache
   generations, chunks, vectors, temporary vault archives, and backups
   separately. Deleting only PDFs does not mean Canvas-derived content has
   been deleted.
9. **Reference-aware garbage collection.** Delete a shared cache object only
   after no retained user note, attachment, import, share, or active job
   references it.
10. **Account-erasure completion.** Implement and verify the promised
    post-grace-period hard deletion, including PostgreSQL, Qdrant, object
    storage, shared-cache eligibility, chat content, and applicable backup
    expiry.

## Known Hazards To Resolve

- Permanent single-note cleanup protects `imports/shared/` objects, while the
  whole-vault deletion route currently attempts to delete all object keys
  referenced by the user's notes. Those paths must share the same
  reference-aware policy before any cleanup campaign.
- The account-deletion route soft-deletes the login and promises permanent
  removal after 30 days, but the hard-deletion worker or process is not present
  in the current implementation.
- Disconnecting Canvas removes the stored token and domain but intentionally
  leaves imported content. A reduced-retention UI must explain whether
  disconnecting also makes remote-only originals inaccessible.
- Extracted Markdown, chunk text, Marker assets, embeddings, chat answers, and
  backups remain data-processing concerns after an original PDF is removed.
- Global content-addressed reuse must not expose cache-hit timing, content
  existence, or an object to a user who has not independently demonstrated
  access or received an explicit share.

## Activation Procedure

The terminal condition for activation is a verified mode rollout and a
reconciled inventory, not merely a deployed flag.

1. Name the incident owner and decision authority.
2. Record the trigger, deadline, affected environments, affected users, data
   classes, and whether the instruction applies to new ingestion, existing
   data, backups, or all four.
3. If new retention must stop before the mode is implemented, suspend the
   affected import entry point rather than accepting jobs whose data contract
   cannot be honoured. Do not improvise an object-store deletion command.
4. Select Mode 1, 2, or 3 and approve its visible degradation.
5. Inventory references and object counts without logging filenames, note
   content, tokens, or signed URLs.
6. Implement the required policy, source locator, UI, export, cleanup, and
   audit changes through the normal `dev` to `main` release path.
7. Validate on isolated fixtures, including a shared PDF, a non-PDF file, a
   Marker job, an annotation, a revoked Canvas token, a changed Canvas file,
   sharing, vault export, vault deletion, and account erasure.
8. Deploy the mode for new imports first. Verify terminal cleanup for success,
   failure, retry, cancellation, timeout, and worker restart.
9. Run existing-data cleanup as a separate, resumable, dry-run-first job.
   Recompute references immediately before each destructive batch.
10. Reconcile PostgreSQL, Qdrant, object storage, job state, and backup
    retention. Record exceptions and owners.
11. Publish accurate user and institutional communication describing what is
    retained, what is remote-only, and which features can fail without Canvas.

## Verification And Rollback

Verification must prove:

- no new durable original is created in the selected mode;
- a live fetch checks current user authority and streams the expected bytes;
- transient objects disappear after every terminal path;
- search and cited chat still hydrate correct user-scoped chunk text;
- local assignments and time blocks continue working without the original
  files;
- the Oghma calendar does not imply that live Canvas calendar/planner data was
  mirrored;
- vault export reports remote-only or unavailable files explicitly;
- deleting one user's vault cannot damage another user's shared reference;
- account erasure and backup expiry match the communicated retention policy.

Rollback means returning new imports to durable-original retention. It cannot
restore originals already deleted. Recovery of those objects depends on
current Canvas access or an authorised backup whose own retention remains
valid. The incident record must therefore state the point after which cleanup
is irreversible.

## Decision Guidance

If the constraint is limited to storage cost, first remove duplicate derived
representations, expired pipeline generations, temporary archives, and
unreferenced assets; original object storage is not currently the largest
measured margin risk.

If the constraint specifically prohibits retaining course-file originals,
prefer Mode 1 with optional Mode 3 pinning. It preserves the core local
assignment, note, search, cited-chat, flashcard, and study-planning experience
while making the loss of Canvas access an explicit product boundary.

If the constraint applies to all Canvas-derived content, Mode 1 is not enough.
Assignment descriptions, extracted notes, chunks, vectors, Marker assets, and
Canvas-informed chat answers must be included in the scope and purpose review.

This document is an engineering contingency plan, not legal advice. The
responsible organisation must determine its lawful basis, purposes, retention
periods, processor terms, notices, and response obligations with appropriate
professional advice.
