#!/usr/bin/env bash
set -euo pipefail

RESULTS=${1:?usage: marker-bench-finalize.sh RESULTS_DIR BUNDLE_PREFIX RUN_LABEL}
PREFIX=${2:?usage: marker-bench-finalize.sh RESULTS_DIR BUNDLE_PREFIX RUN_LABEL}
RUN_LABEL=${3:?usage: marker-bench-finalize.sh RESULTS_DIR BUNDLE_PREFIX RUN_LABEL}

exec python3 scripts/marker-bench-artifacts.py finalize \
  "$RESULTS" "$PREFIX" --run-label "$RUN_LABEL"
