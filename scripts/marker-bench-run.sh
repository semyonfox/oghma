#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "usage: marker-bench-run.sh CORPUS_DIR ATTESTATION_JSON RESULTS_DIR [marker-bench.py options]" >&2
  exit 2
fi

CORPUS=$1
ATTESTATION=$2
RESULTS=$3
shift 3

MODE=${MARKER_BENCH_MODE:-run}
if [[ "$MODE" != "run" && "$MODE" != "diagnostic" ]]; then
  echo "MARKER_BENCH_MODE must be run or diagnostic" >&2
  exit 2
fi
exec python3 scripts/marker-bench.py "$MODE" "$CORPUS" "$ATTESTATION" "$RESULTS" "$@"
