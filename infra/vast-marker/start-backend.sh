#!/usr/bin/env bash
set -euo pipefail

VLLM_PORT=${SURYA_PORT:-8001}
BACKEND_PORT=${MARKER_BACKEND_PORT:-18000}
LOG_DIR=/var/log/marker
mkdir -p "$LOG_DIR"
BACKEND_LOG="$LOG_DIR/backend.log"

VLLM_PID=
BACKEND_PID=

cleanup() {
  for pid in "$BACKEND_PID" "$VLLM_PID"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT
trap 'exit 0' INT TERM

fatal() {
  printf 'MARKER_BACKEND_FATAL %s\n' "$*" | tee -a "$BACKEND_LOG" >&2
}

vllm serve datalab-to/surya-ocr-2 \
  --host 127.0.0.1 \
  --port "$VLLM_PORT" \
  --served-model-name datalab-to/surya-ocr-2 \
  --dtype "${VLLM_DTYPE:-bfloat16}" \
  --max-model-len 18000 \
  --max-num-seqs "${VLLM_MAX_NUM_SEQS:-32}" \
  --max-num-batched-tokens "${VLLM_MAX_BATCHED_TOKENS:-8192}" \
  --gpu-memory-utilization "${VLLM_GPU_MEMORY_UTILIZATION:-0.85}" \
  --enable-prefix-caching \
  --mm-processor-kwargs '{"min_pixels":3136,"max_pixels":6291456}' \
  --speculative-config '{"method":"mtp","num_speculative_tokens":2}' \
  >"$LOG_DIR/vllm.log" 2>&1 &
VLLM_PID=$!

deadline=$((SECONDS + ${MARKER_VLLM_START_TIMEOUT_SECONDS:-600}))
until curl -fsS "http://127.0.0.1:${VLLM_PORT}/health" >/dev/null; do
  if ! kill -0 "$VLLM_PID" 2>/dev/null; then
    fatal "vLLM exited before readiness"
    exit 1
  fi
  if (( SECONDS >= deadline )); then
    fatal "vLLM readiness timeout"
    exit 1
  fi
  sleep 2
done

/opt/marker-venv/bin/python -m uvicorn backend:app \
  --host 127.0.0.1 \
  --port "$BACKEND_PORT" \
  --workers 1 \
  --timeout-keep-alive 30 \
  --log-level info \
  >>"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

EXITED_PID=
EXIT_STATUS=0
if wait -n -p EXITED_PID "$VLLM_PID" "$BACKEND_PID"; then
  EXIT_STATUS=0
else
  EXIT_STATUS=$?
fi

if [[ "$EXITED_PID" == "$VLLM_PID" ]]; then
  fatal "vLLM exited unexpectedly status=$EXIT_STATUS"
else
  fatal "Marker API exited unexpectedly status=$EXIT_STATUS"
fi

if (( EXIT_STATUS == 0 )); then
  EXIT_STATUS=1
fi
exit "$EXIT_STATUS"
