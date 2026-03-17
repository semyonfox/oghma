#!/bin/bash
set -a
source .env.local
set +a
node scripts/sync-s3-notes.cjs
