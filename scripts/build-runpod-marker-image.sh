#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
export MARKER_GPU_FAMILY=${MARKER_GPU_FAMILY:-nonblackwell}
case "${RUNPOD_MARKER_VALIDATE_ONLY:-0}" in
  0) exec "$SCRIPT_DIR/build-marker-worker-image.sh" gpu-runpod "${RUNPOD_MARKER_IMAGE:?set RUNPOD_MARKER_IMAGE}" ;;
  1) exec "$SCRIPT_DIR/build-marker-worker-image.sh" gpu-runpod --check ;;
  *) echo "RUNPOD_MARKER_VALIDATE_ONLY must be 0 or 1" >&2; exit 2 ;;
esac
