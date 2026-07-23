#!/usr/bin/env bash
set -euo pipefail

REPO=${MARKER_PLUS_PLUS_REPO:-/home/semyon/code/personal/marker++}
COMMIT=${MARKER_PLUS_PLUS_COMMIT:-2d66e45c0a1f8a3c081c6c96f47e1f7b6af2b03a}
DESTINATION=${1:-/tmp/marker-plus-plus-${COMMIT}.tar.gz}
MANIFEST=${DESTINATION%.tar.gz}.manifest.json
INTEGRATION_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

if [[ ! "$COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "MARKER_PLUS_PLUS_COMMIT must be a full 40-character commit" >&2
  exit 2
fi

resolved=$(git -C "$REPO" rev-parse "${COMMIT}^{commit}")
if [[ "$resolved" != "$COMMIT" ]]; then
  echo "resolved commit does not match requested commit" >&2
  exit 3
fi

tree=$(git -C "$REPO" show -s --format=%T "$COMMIT")
if git -C "$REPO" cat-file -e "${COMMIT}:uv.lock" 2>/dev/null; then
  lock_path=uv.lock
elif git -C "$REPO" cat-file -e "${COMMIT}:poetry.lock" 2>/dev/null; then
  lock_path=poetry.lock
else
  echo "selected Marker++ commit has no supported dependency lockfile" >&2
  exit 4
fi
lock_sha=$(git -C "$REPO" show "${COMMIT}:${lock_path}" | sha256sum | cut -d' ' -f1)
temporary_tar=$(mktemp)
trap 'rm -f "$temporary_tar"' EXIT
git -C "$REPO" archive --format=tar --prefix=marker-plus-plus/ -o "$temporary_tar" "$COMMIT"
tar -C "$INTEGRATION_ROOT" --append --file "$temporary_tar" \
  --transform='s,^oghma_marker/services.py$,marker-plus-plus/marker/services/openai_compatible_vision.py,' \
  oghma_marker/services.py
gzip -n -c "$temporary_tar" > "$DESTINATION"
archive_sha=$(sha256sum "$DESTINATION" | cut -d' ' -f1)
integration_sha=$(sha256sum "$INTEGRATION_ROOT/oghma_marker/services.py" | cut -d' ' -f1)
sha256sum "$DESTINATION" > "${DESTINATION}.sha256"
python3 - "$MANIFEST" "$COMMIT" "$tree" "$lock_path" "$lock_sha" "$archive_sha" "$integration_sha" <<'PY'
import json
import pathlib
import sys

path, commit, tree, lock_path, lock_sha, archive_sha, integration_sha = sys.argv[1:]
pathlib.Path(path).write_text(
    json.dumps(
        {
            "schemaVersion": 1,
            "commit": commit,
            "tree": tree,
            "dependencyLockPath": lock_path,
            "poetryLockSha256": lock_sha,
            "archiveSha256": archive_sha,
            "repositoryIntegrationSha256": integration_sha,
        },
        indent=2,
    )
    + "\n"
)
PY
chmod 0600 "$DESTINATION" "${DESTINATION}.sha256" "$MANIFEST"
printf '%s\n' "$DESTINATION"
