# AI Settings And Vault Import/Export Spec

Status: historical design record.

## Intent

Add visible AI configuration affordances and support import/export of a user's notes vault as a zip archive.

## Decisions

- AI settings starts as a model selector plus disabled BYOK fields.
- Vault import accepts a zip archive and recreates folders/notes.
- Vault export produces a zip archive of the user's tree, notes, and files.
- Import/export jobs run asynchronously through the worker system.
- Status polling reports progress and completion/download links.
- Supported import files include Markdown/text and common document formats where extraction is available.

## Architecture Notes

The original spec named the old queue/deploy stack. Current implementation should be read through BullMQ, Redis, RustFS/S3-compatible storage, and the homelab worker deployment.

## Verification

- Large archives stream rather than loading fully into memory.
- Existing active jobs are handled safely.
- Import preserves folder structure.
- Export can be downloaded and re-imported.
