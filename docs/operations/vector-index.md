# Vector index rebuild

> **Status:** Active operations runbook
>
> **Last reviewed:** 2026-10-16, against `scripts/backfill-embeddings-direct.ts`, `scripts/reindex-all-notes.ts` and `src/lib/qdrant.ts` on `dev` after #633. Neither script has been run against production since those changes.

Qdrant holds only derived data. PostgreSQL `app.chunks` keeps the chunk text, ids and ownership, so the vector index can always be rebuilt from it. Pick the script by what was lost.

## Qdrant data was lost or the collection was recreated

```bash
npx tsx scripts/backfill-embeddings-direct.ts
```

This re-embeds the existing `app.chunks` rows under their current ids. It doesn't re-chunk anything, so quiz questions keep their `chunk_id` provenance. Chunks of trashed notes are upserted and then hidden (`searchable=false`), so restoring a note later still finds its vectors. It pages by key, skips blank rows in SQL, and deletes vectors for chunks that disappeared mid-batch. It is safe to re-run.

The app recreates a missing collection on first use and clears its cached collection state after any Qdrant 404, so a wiped volume doesn't need an app restart. Search for a note just returns nothing until its vectors are back.

## The chunking or embedding model changed

```bash
npx tsx scripts/reindex-all-notes.ts --dry-run
npx tsx scripts/reindex-all-notes.ts
```

This re-chunks and re-embeds every live note, replacing each note's chunks and vectors in one locked transaction. New chunk ids are minted, so existing quiz cards for those notes stop being served (an open item in the [domain audit record](../history/2026-10-06-domain-audit.md)). Notes that still have chunks but no text are cleared. The script exits 1 if any note failed; a failed note keeps its previous index.

The old `--force` flag, which deleted every user's vectors in one request before reindexing, is gone. The per-note replace is already idempotent.

## Before either run

- Check `QDRANT_URL` and `QDRANT_COLLECTION` point at the intended environment. Prod and dev use separate collections; see the [homelab runbook](../../infra/HOMELAB.md).
- Both scripts call the embedding provider for every chunk, which costs money at the provider's rates. Check the chunk count first.
- Run against dev first.
