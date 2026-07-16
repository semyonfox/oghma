#!/usr/bin/env bash
set -euo pipefail

PYTHON=${MARKER_BENCH_PYTHON:-python3}
exec "$PYTHON" scripts/marker-bench.py "$@"
