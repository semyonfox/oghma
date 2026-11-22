#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
exec "$SCRIPT_DIR/build-marker-worker-image.sh" gpu-vast "${VAST_MARKER_IMAGE:?set VAST_MARKER_IMAGE}"
