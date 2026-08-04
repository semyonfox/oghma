#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MARKER_SOURCE_REPOSITORY=${MARKER_PLUS_PLUS_REPO:-/home/semyon/code/personal/marker++}
MARKER_SOURCE_COMMIT=${MARKER_PLUS_PLUS_COMMIT:-d31ecd2223588c8a2d014ece9d04fb99b0e45d57}
IMAGE_REFERENCE=${VAST_MARKER_IMAGE:-}
CUDA_VARIANT=${MARKER_CUDA_VARIANT:-cu129}
GPU_FAMILY=${MARKER_GPU_FAMILY:-generic}

if [[ -z "$IMAGE_REFERENCE" ]]; then
  echo "VAST_MARKER_IMAGE is required (use an immutable version tag, not latest)" >&2
  exit 2
fi
if [[ "${IMAGE_REFERENCE##*/}" != *:* || "$IMAGE_REFERENCE" == *:latest ]]; then
  echo "VAST_MARKER_IMAGE must use a unique, explicit tag (never latest)" >&2
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

BUILD_CONTEXT=$(mktemp -d /tmp/oghma-vast-marker-build.XXXXXX)
cleanup() {
  rm -rf -- "$BUILD_CONTEXT"
}
trap cleanup EXIT

MARKER_PLUS_PLUS_REPO="$MARKER_SOURCE_REPOSITORY" \
MARKER_PLUS_PLUS_COMMIT="$MARKER_SOURCE_COMMIT" \
  "$REPOSITORY_ROOT/scripts/package-marker-plus-plus.sh" \
  "$BUILD_CONTEXT/marker-plus-plus.tar.gz"

(cd "$BUILD_CONTEXT" && sha256sum marker-plus-plus.tar.gz > marker-plus-plus.tar.gz.sha256)
cp -a "$REPOSITORY_ROOT/infra/vast-marker/." "$BUILD_CONTEXT/"

docker build \
  --file "$BUILD_CONTEXT/Dockerfile" \
  --platform linux/amd64 \
  --build-arg "MARKER_CUDA_VARIANT=$CUDA_VARIANT" \
  --build-arg "MARKER_GPU_FAMILY=$GPU_FAMILY" \
  --label "org.opencontainers.image.revision=$MARKER_SOURCE_COMMIT" \
  --tag "$IMAGE_REFERENCE" \
  "$BUILD_CONTEXT"

docker image inspect "$IMAGE_REFERENCE" \
  --format 'built {{index .RepoTags 0}} id={{.Id}}'
