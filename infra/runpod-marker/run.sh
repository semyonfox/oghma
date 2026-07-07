#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export HF_HOME="${HF_HOME:-/workspace/.cache/huggingface}"
export TORCH_HOME="${TORCH_HOME:-/workspace/.cache/torch}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/workspace/.cache}"
export TORCH_DEVICE="${TORCH_DEVICE:-cuda}"
export MARKER_PORT="${MARKER_PORT:-8000}"
export RUNPOD_START_SERVICES="${RUNPOD_START_SERVICES:-1}"

mkdir -p "$HF_HOME" "$TORCH_HOME" "$XDG_CACHE_HOME"

if [[ -z "${MARKER_UVICORN_WORKERS:-}" ]]; then
  MARKER_UVICORN_WORKERS=4
  if command -v nvidia-smi >/dev/null 2>&1; then
    vram_mb="$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -n 1 | tr -dc '0-9' || true)"
    cpu_count="$(nproc 2>/dev/null || echo 4)"
    if [[ -n "$vram_mb" && "$vram_mb" -gt 0 ]]; then
      MARKER_UVICORN_WORKERS="$((vram_mb / 8192))"
      if [[ "$MARKER_UVICORN_WORKERS" -gt "$cpu_count" ]]; then
        MARKER_UVICORN_WORKERS="$cpu_count"
      fi
      if [[ "$MARKER_UVICORN_WORKERS" -gt 32 ]]; then
        MARKER_UVICORN_WORKERS=32
      fi
      if [[ "$MARKER_UVICORN_WORKERS" -lt 4 ]]; then
        MARKER_UVICORN_WORKERS=4
      fi
    fi
  fi
  export MARKER_UVICORN_WORKERS
fi

python - <<'PY'
import torch
print("torch cuda available:", torch.cuda.is_available(), flush=True)
if torch.cuda.is_available():
    print("gpu count:", torch.cuda.device_count(), flush=True)
    for index in range(torch.cuda.device_count()):
        print(f"gpu {index}: {torch.cuda.get_device_name(index)}", flush=True)
PY

echo "marker uvicorn workers: ${MARKER_UVICORN_WORKERS}"
echo "marker convert concurrency per worker: ${MARKER_CONVERT_CONCURRENCY:-1}"

if [[ "$RUNPOD_START_SERVICES" == "1" && -x /start.sh ]]; then
  /start.sh &
fi

exec python -m uvicorn server:app \
  --host 0.0.0.0 \
  --port "$MARKER_PORT" \
  --workers "$MARKER_UVICORN_WORKERS" \
  --timeout-keep-alive 30 \
  --log-level info
