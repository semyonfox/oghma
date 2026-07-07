#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-${RUNPOD_SSH_TARGET:-}}"
KEY="${RUNPOD_SSH_KEY:-$HOME/.ssh/runpod_marker_ed25519}"
REMOTE_LOG="${REMOTE_LOG:-/workspace/oghma-marker-bench/aggressive-run.log}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: npm run runpod:marker:tail -- <user@ssh.runpod.io>" >&2
  exit 1
fi

ssh -tt \
  -i "$KEY" \
  -o StrictHostKeyChecking=accept-new \
  -o BatchMode=yes \
  "$TARGET" <<REMOTE
set -euo pipefail
tail -f "$REMOTE_LOG"
REMOTE
