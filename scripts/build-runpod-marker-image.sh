#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
IMAGE_REFERENCE=${RUNPOD_MARKER_IMAGE:-}
MARKER_SOURCE_REPOSITORY=${MARKER_PLUS_PLUS_REPO:-/home/semyon/code/personal/marker++}
MARKER_SOURCE_COMMIT=${MARKER_PLUS_PLUS_COMMIT:-d31ecd2223588c8a2d014ece9d04fb99b0e45d57}
CUDA_VARIANT=${MARKER_CUDA_VARIANT:-cu129}
GPU_FAMILY=${MARKER_GPU_FAMILY:-nonblackwell}
VALIDATE_ONLY=${RUNPOD_MARKER_VALIDATE_ONLY:-0}

if [[ "$VALIDATE_ONLY" != "0" && "$VALIDATE_ONLY" != "1" ]]; then
  echo "RUNPOD_MARKER_VALIDATE_ONLY must be 0 or 1" >&2
  exit 2
fi
if [[ "$VALIDATE_ONLY" == "0" && -z "$IMAGE_REFERENCE" ]]; then
  echo "RUNPOD_MARKER_IMAGE is required (use an immutable version tag, not latest)" >&2
  exit 2
fi
if [[ "$VALIDATE_ONLY" == "0" && ( "${IMAGE_REFERENCE##*/}" != *:* || "$IMAGE_REFERENCE" == *:latest ) ]]; then
  echo "RUNPOD_MARKER_IMAGE must use a unique, explicit tag (never latest)" >&2
  exit 2
fi
if [[ ! "$MARKER_SOURCE_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "MARKER_PLUS_PLUS_COMMIT must be a full 40-character commit" >&2
  exit 2
fi
if [[ "$CUDA_VARIANT" != "cu129" && "$CUDA_VARIANT" != "cu13" ]]; then
  echo "MARKER_CUDA_VARIANT must be cu129 or cu13" >&2
  exit 2
fi
if [[ "$GPU_FAMILY" != "nonblackwell" && "$GPU_FAMILY" != "generic" ]]; then
  echo "MARKER_GPU_FAMILY must be nonblackwell or generic" >&2
  exit 2
fi

BUILD_CONTEXT=$(mktemp -d /tmp/oghma-runpod-marker-build.XXXXXX)
cleanup() {
  rm -rf -- "$BUILD_CONTEXT"
}
trap cleanup EXIT

MARKER_PLUS_PLUS_REPO="$MARKER_SOURCE_REPOSITORY" \
MARKER_PLUS_PLUS_COMMIT="$MARKER_SOURCE_COMMIT" \
  "$REPOSITORY_ROOT/scripts/package-marker-plus-plus.sh" \
  "$BUILD_CONTEXT/marker-plus-plus.tar.gz"

(cd "$BUILD_CONTEXT" && sha256sum marker-plus-plus.tar.gz > marker-plus-plus.tar.gz.sha256)
cp -a "$REPOSITORY_ROOT/infra/runpod-marker/." "$BUILD_CONTEXT/"

if [[ "$VALIDATE_ONLY" == "1" ]]; then
  docker buildx build --check --file "$BUILD_CONTEXT/Dockerfile" "$BUILD_CONTEXT"
  exit 0
fi

docker build \
  --file "$BUILD_CONTEXT/Dockerfile" \
  --platform linux/amd64 \
  --build-arg "MARKER_CUDA_VARIANT=$CUDA_VARIANT" \
  --build-arg "MARKER_GPU_FAMILY=$GPU_FAMILY" \
  --build-arg "MARKER_PLUS_PLUS_COMMIT=$MARKER_SOURCE_COMMIT" \
  --label "org.opencontainers.image.revision=$MARKER_SOURCE_COMMIT" \
  --tag "$IMAGE_REFERENCE" \
  "$BUILD_CONTEXT"

docker image inspect "$IMAGE_REFERENCE" \
  --format 'built {{index .RepoTags 0}} id={{.Id}} revision={{index .Config.Labels "org.opencontainers.image.revision"}}'
