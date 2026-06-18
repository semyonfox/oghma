# Marker GPU Prewarm And AMI Bake Plan

Status: historical AWS-era plan. The live deployment now runs on the homelab stack; use current infra docs before acting on any AWS Marker idea.

## Goal

Reduce Marker OCR cold start, fix GPU launch failures, and retry high-quality OCR after lower-quality fallback extraction.

## Original Scope

- Move Marker ASG from spot to on-demand because GPU spot quota was blocking launches.
- Bake a Marker-ready AMI to reduce cold start.
- Allow launch templates to use a baked AMI.
- Prewarm Marker after Canvas connection or registration.
- Restore extraction retry logic for scanned PDFs after `pdf-parse` fallback.
- Document that `pdf-parse` is not OCR and can return empty content for scanned/image-heavy PDFs.

## Current Relevance

- The AWS ASG/AMI commands are historical.
- The product lesson remains current: OCR can be slow or unavailable, and users need clear "processing" copy.
- The retry concept remains relevant through the current `extract-retry` BullMQ queue.
- `MARKER_API_URL` remains the switch for Marker OCR.

## Verification

- Fallback extraction does not falsely mark scanned PDFs as fully indexed.
- Marker-enabled environments retry richer OCR when available.
- Users see honest status while OCR/indexing is delayed.
- Any future AWS GPU rebuild updates `infra/`, pricing, and deployment docs together.
