#!/usr/bin/env bash
set -euo pipefail

# Use Vast's pinned start-server lifecycle for certificate generation, worker
# registration, metrics, and PyWorker startup. The immutable image already
# contains worker.py, its venv, and requirements, so no mutable Git clone or
# cold-start package installation is needed.
export SERVER_DIR=/app
export ENV_PATH=/opt/marker-venv
export MODEL_LOG=/var/log/marker/backend.log
export ROTATE_MODEL_LOG=false
export SDK_VERSION=1.5.0
export USE_SSL=${USE_SSL:-true}

BACKEND_SUPERVISOR_PID=
VAST_START_SERVER_PID=

cleanup() {
  for pid in "$VAST_START_SERVER_PID" "$BACKEND_SUPERVISOR_PID"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT
trap 'exit 0' INT TERM

mkdir -p /var/log/marker
: >"$MODEL_LOG"

/app/start-backend.sh &
BACKEND_SUPERVISOR_PID=$!

/app/vast-start-server.sh &
VAST_START_SERVER_PID=$!

EXITED_PID=
EXIT_STATUS=0
if wait -n -p EXITED_PID \
  "$BACKEND_SUPERVISOR_PID" \
  "$VAST_START_SERVER_PID"; then
  EXIT_STATUS=0
else
  EXIT_STATUS=$?
fi

if [[ "$EXITED_PID" == "$BACKEND_SUPERVISOR_PID" ]]; then
  echo "Marker backend supervisor exited status=$EXIT_STATUS" >&2
else
  echo "Vast PyWorker bootstrap exited status=$EXIT_STATUS" >&2
fi

if (( EXIT_STATUS == 0 )); then
  EXIT_STATUS=1
fi
exit "$EXIT_STATUS"
