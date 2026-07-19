#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -ne 3 ]]; then
  echo "usage: marker-bench-prepare-instance.sh CLEAN_ARCHIVE DIAGNOSTIC_ARCHIVE WORKSPACE" >&2
  exit 2
fi

CLEAN_ARCHIVE=$(realpath "$1")
DIAGNOSTIC_ARCHIVE=$(realpath "$2")
WORKSPACE=$(realpath -m "$3")

verify_archive() {
  local archive=$1
  local manifest=${archive%.tar.gz}.manifest.json
  [[ -f "$archive.sha256" && -f "$manifest" ]] || {
    echo "archive checksum or manifest missing" >&2
    exit 3
  }
  (cd "$(dirname "$archive")" && sha256sum -c "$(basename "$archive").sha256")
  python3 - "$archive" "$manifest" <<'PY'
import hashlib
import json
import pathlib
import sys

archive, manifest = map(pathlib.Path, sys.argv[1:])
value = json.loads(manifest.read_text())
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
if value.get("schemaVersion") != 1 or value.get("archiveSha256") != digest:
    raise SystemExit("package manifest/archive mismatch")
for key, length in (("commit", 40), ("tree", 40), ("poetryLockSha256", 64)):
    field = value.get(key, "")
    if len(field) != length or any(ch not in "0123456789abcdef" for ch in field):
        raise SystemExit(f"invalid package manifest field: {key}")
PY
}

prepare_environment() {
  local name=$1
  local archive=$2
  local environment="$WORKSPACE/venvs/$name"
  python3 -m venv --system-site-packages "$environment"
  "$environment/bin/python" -m pip install --disable-pip-version-check --no-deps --force-reinstall "$archive"
  TORCH_DEVICE=cuda "$environment/bin/python" - <<'PY'
import torch
from marker.models import create_model_dict

if not torch.cuda.is_available():
    raise SystemExit("CUDA is unavailable during Marker++ model prefetch")
create_model_dict()
print(torch.cuda.get_device_name(0))
PY
  "$environment/bin/python" -m pip freeze --all >"$WORKSPACE/manifests/$name-packages.txt"
}

verify_archive "$CLEAN_ARCHIVE"
verify_archive "$DIAGNOSTIC_ARCHIVE"
mkdir -p "$WORKSPACE/venvs" "$WORKSPACE/manifests"
chmod 0700 "$WORKSPACE" "$WORKSPACE/venvs" "$WORKSPACE/manifests"
prepare_environment clean "$CLEAN_ARCHIVE"
prepare_environment diagnostic "$DIAGNOSTIC_ARCHIVE"
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader \
  >"$WORKSPACE/manifests/gpu.txt"
chmod 0600 "$WORKSPACE/manifests"/*
echo "Marker++ clean and diagnostic environments prepared with shared model caches"
