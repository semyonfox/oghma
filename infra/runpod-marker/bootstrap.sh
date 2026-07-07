#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export HF_HOME="${HF_HOME:-/workspace/.cache/huggingface}"
export TORCH_HOME="${TORCH_HOME:-/workspace/.cache/torch}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/workspace/.cache}"
mkdir -p "$HF_HOME" "$TORCH_HOME" "$XDG_CACHE_HOME"

python -m pip install --upgrade pip
python -m pip install --upgrade -r "$SCRIPT_DIR/requirements.txt"

export RUNPOD_START_SERVICES="${RUNPOD_START_SERVICES:-0}"
exec "$SCRIPT_DIR/run.sh"
