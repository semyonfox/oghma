#!/usr/bin/env node

// Compatibility entry point. The reindex script now stores vectors in Qdrant
// and keeps chunk metadata in Postgres.
await import("./reindex-all-notes.mjs");
