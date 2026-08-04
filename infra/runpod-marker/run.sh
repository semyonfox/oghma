#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
# Each process has an intentionally separate dependency overlay. Do not let a
# provider-supplied Python path cross the boundary between them.
unset PYTHONPATH

now_unix_ms() {
  date +%s%3N
}

if [[ ! "${RUNPOD_INIT_TIMEOUT:-800}" =~ ^[1-9][0-9]*$ ]]; then
  export RUNPOD_INIT_TIMEOUT=800
else
  export RUNPOD_INIT_TIMEOUT
fi
export MARKER_CONTAINER_STARTED_AT_UNIX_MS="$(now_unix_ms)"

export HF_HOME="${HF_HOME:-/opt/marker-cache/huggingface}"
export TORCH_HOME="${TORCH_HOME:-/opt/marker-cache/torch}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/opt/marker-cache}"
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1
# Keep the small OCR-error model off the 24 GB GPU; the vLLM Surya backend is
# the only GPU consumer in this image.
export TORCH_DEVICE=cpu
export SURYA_PORT="${SURYA_PORT:-8001}"
export SURYA_INFERENCE_URL="http://127.0.0.1:${SURYA_PORT}/v1"
if [[ "${MARKER_RUNTIME:-serverless}" != "serverless" ]]; then
  echo "this image is for RunPod Serverless only" >&2
  exit 2
fi
export MARKER_RUNTIME=serverless

mkdir -p "$HF_HOME" "$TORCH_HOME" "$XDG_CACHE_HOME"

# The exact RTX 4090 request-admission knee was three, so Serverless defaults
# there. Each child is warmed before the handler accepts paid work.
export MARKER_HANDLER_CONCURRENCY="${MARKER_HANDLER_CONCURRENCY:-3}"

python3 - <<'PY'
import torch
print("torch cuda available:", torch.cuda.is_available(), flush=True)
if torch.cuda.is_available():
    print("gpu count:", torch.cuda.device_count(), flush=True)
    for index in range(torch.cuda.device_count()):
        print(f"gpu {index}: {torch.cuda.get_device_name(index)}", flush=True)
PY

echo "marker runtime: ${MARKER_RUNTIME}"
echo "marker handler concurrency: ${MARKER_HANDLER_CONCURRENCY}"
echo "marker convert concurrency per worker: ${MARKER_CONVERT_CONCURRENCY:-1}"
echo "marker-runtime event=container_started container_started_at_unix_ms=${MARKER_CONTAINER_STARTED_AT_UNIX_MS} runpod_init_timeout_seconds=${RUNPOD_INIT_TIMEOUT}"

/opt/vllm-venv/bin/vllm serve datalab-to/surya-ocr-2 \
  --host 127.0.0.1 \
  --port "$SURYA_PORT" \
  --served-model-name datalab-to/surya-ocr-2 \
  --dtype "${VLLM_DTYPE:-bfloat16}" \
  --max-model-len 18000 \
  --max-num-seqs "${VLLM_MAX_NUM_SEQS:-32}" \
  --max-num-batched-tokens "${VLLM_MAX_BATCHED_TOKENS:-8192}" \
  --gpu-memory-utilization "${VLLM_GPU_MEMORY_UTILIZATION:-0.85}" \
  --enable-prefix-caching \
  --mm-processor-kwargs '{"min_pixels":3136,"max_pixels":6291456}' \
  --speculative-config '{"method":"mtp","num_speculative_tokens":2}' &
VLLM_PID=$!
trap 'kill "$VLLM_PID" 2>/dev/null || true' EXIT

deadline=$((SECONDS + RUNPOD_INIT_TIMEOUT))
until curl -fsS "http://127.0.0.1:${SURYA_PORT}/health" >/dev/null; do
  if ! kill -0 "$VLLM_PID" 2>/dev/null; then
    echo "vLLM exited before becoming healthy" >&2
    exit 1
  fi
  if (( SECONDS >= deadline )); then
    echo "vLLM health timeout" >&2
    exit 1
  fi
  sleep 2
done
export MARKER_BACKEND_READY_AT_UNIX_MS="$(now_unix_ms)"
export MARKER_CONTAINER_TO_BACKEND_READY_MS=$((MARKER_BACKEND_READY_AT_UNIX_MS - MARKER_CONTAINER_STARTED_AT_UNIX_MS))
echo "surya vLLM ready on ${SURYA_PORT}"
echo "marker-runtime event=backend_ready backend_ready_at_unix_ms=${MARKER_BACKEND_READY_AT_UNIX_MS} container_to_backend_ready_ms=${MARKER_CONTAINER_TO_BACKEND_READY_MS}"

echo "marker-runtime event=serverless_handler_start handler_concurrency=${MARKER_HANDLER_CONCURRENCY}"
exec /usr/local/bin/python /app/handler.py
