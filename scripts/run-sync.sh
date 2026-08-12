#!/bin/bash
set -a
source .env.local
set +a
npx tsx scripts/sync-s3-notes.ts
