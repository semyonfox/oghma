#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TARGET=${1:?usage: build-marker-worker-image.sh TARGET [IMAGE | --check]}
OUTPUT=${2:-}
COMMIT=${MARKER_PLUS_PLUS_COMMIT:-1f6ecaafc210d257901daa6bfe0c43ad3a3eaedb}
CUDA_VARIANT=${MARKER_CUDA_VARIANT:-cu129}
GPU_FAMILY=${MARKER_GPU_FAMILY:-generic}

case "$TARGET" in
  marker-base|worker-base|gpu-base|cpu|gpu-runpod|gpu-vast) ;;
  *) echo "unknown Marker worker target: $TARGET" >&2; exit 2 ;;
esac
case "$CUDA_VARIANT" in
  cu129|cu13) ;;
  *) echo "MARKER_CUDA_VARIANT must be cu129 or cu13" >&2; exit 2 ;;
esac
case "$GPU_FAMILY" in
  nonblackwell|generic) ;;
  *) echo "MARKER_GPU_FAMILY must be nonblackwell or generic" >&2; exit 2 ;;
esac
if [[ "$OUTPUT" == "--check" ]]; then
  build_output=(--check)
elif [[ "${OUTPUT##*/}" == *:* && "$OUTPUT" != *: && "$OUTPUT" != *:latest ]]; then
  build_output=(--load --tag "$OUTPUT")
else
  echo "an explicit image tag or --check is required" >&2
  exit 2
fi

CONTEXT=$(mktemp -d /tmp/oghma-marker-worker-build.XXXXXX)
trap 'rm -rf -- "$CONTEXT"' EXIT

MARKER_PLUS_PLUS_COMMIT="$COMMIT" "$ROOT/scripts/package-marker-plus-plus.sh" \
  "$CONTEXT/marker-plus-plus.tar.gz"

mkdir "$CONTEXT"/{marker-worker,oghma_marker,runpod-marker,vast-marker}
cp "$ROOT"/infra/marker-worker/{Dockerfile,prefetch_models.py,constraints-marker.txt,constraints-vllm.txt,requirements-http.txt} "$CONTEXT/marker-worker/"
cp "$ROOT"/oghma_marker/{pyproject.toml,__init__.py,services.py,conversion.py,job.py} "$CONTEXT/oghma_marker/"
cp "$ROOT"/infra/runpod-marker/{handler.py,requirements.txt,run.sh} "$CONTEXT/runpod-marker/"
cp "$ROOT"/infra/vast-marker/{backend.py,worker.py,requirements-pyworker.txt,generate_benchmark_pdf.py,start-backend.sh,vast-onstart.sh} "$CONTEXT/vast-marker/"

gpu_args=()
if [[ "$TARGET" == gpu-* ]]; then
  gpu_args=(--build-arg "MARKER_CUDA_VARIANT=$CUDA_VARIANT" --build-arg "MARKER_GPU_FAMILY=$GPU_FAMILY")
fi

nice -n 15 docker buildx build --file "$CONTEXT/marker-worker/Dockerfile" \
  --platform linux/amd64 --target "$TARGET" \
  --build-arg "MARKER_PLUS_PLUS_COMMIT=$COMMIT" \
  "${gpu_args[@]}" "${build_output[@]}" "$CONTEXT"
