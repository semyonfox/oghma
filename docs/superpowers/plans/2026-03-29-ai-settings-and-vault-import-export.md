# AI Settings And Vault Import/Export Plan

Status: historical implementation record. Queue/provider names in the original plan predated the current BullMQ/homelab deployment.

## Goal

Add an AI settings section and full vault import/export support for zip-based note archives.

## Scope

- Replace the placeholder AI settings section with a model selector and BYOK placeholder.
- Add streaming zip support with `fflate`.
- Extend the job table for vault import/export metadata.
- Add completion email helpers.
- Add shared folder/path utilities for rebuilding a note tree from archive paths.
- Add vault import worker.
- Add vault export worker.
- Wire vault jobs into the worker entry point.
- Add upload presign, import start, export start, and status API routes.
- Add settings UI for import/export status and download links.

## Key Files

| Area | Files |
|---|---|
| UI | settings page / data export section / AI settings section |
| Worker | `src/lib/vault/import-worker.js`, `src/lib/vault/export-worker.js`, `src/lib/canvas/worker-entry.js` |
| APIs | `src/app/api/vault/*` |
| Storage/tree | `src/lib/vault/tree-builder.js`, storage provider helpers |
| Jobs | `app.canvas_import_jobs` migrations and status route |

## Verification

- Import accepts a zip and recreates folders/notes under the user's tree.
- Supported files are stored and indexed where appropriate.
- Export produces a downloadable archive of notes and files.
- Existing active jobs are handled safely.
- Large archives stream rather than loading entirely into memory.
