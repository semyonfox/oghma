#!/usr/bin/env bash
set -euo pipefail
umask 077

CONFIG=${1:?usage: marker-bench-collect.sh OPERATOR_CONFIG INSTANCE_ID REGION REMOTE_RESULTS RUN_LABEL}
INSTANCE_ID=${2:?}
REGION=${3:?}
REMOTE_RESULTS=${4:?}
RUN_LABEL=${5:?}

if [[ $(stat -c '%a' "$CONFIG") != 600 ]]; then
  echo "operator config must have mode 0600" >&2
  exit 2
fi

mapfile -t config_values < <(python3 - "$CONFIG" <<'PY'
import json
import pathlib
import sys

config = json.loads(pathlib.Path(sys.argv[1]).read_text())
for key in [
    "awsSshHost",
    "awsRepoPath",
    "homelabSshHost",
    "homelabDestination",
    "localRelay",
    "awsProfile",
    "expectedAccount",
    "runTag",
]:
    value = config.get(key)
    if not isinstance(value, str) or not value or "\n" in value:
        raise SystemExit(f"missing or invalid operator config field: {key}")
    print(value)
PY
)

AWS_HOST=${config_values[0]}
AWS_REPO=${config_values[1]}
HOMELAB_HOST=${config_values[2]}
HOMELAB_DESTINATION=${config_values[3]}
LOCAL_RELAY=${config_values[4]}
AWS_PROFILE=${config_values[5]}
EXPECTED_ACCOUNT=${config_values[6]}
RUN_TAG=${config_values[7]}
REMOTE_PREFIX="/tmp/oghma-marker-${RUN_LABEL}"
LOCAL_RUN="$LOCAL_RELAY/$RUN_LABEL"
HOMELAB_STAGE="$HOMELAB_DESTINATION/.incoming-$RUN_LABEL"
HOMELAB_FINAL="$HOMELAB_DESTINATION/$RUN_LABEL"

mkdir -p "$LOCAL_RUN"
chmod 0700 "$LOCAL_RELAY" "$LOCAL_RUN"

ssh -o BatchMode=yes "$AWS_HOST" bash -s -- "$AWS_REPO" "$REMOTE_RESULTS" "$REMOTE_PREFIX" "$RUN_LABEL" <<'SH'
set -euo pipefail
repo=$1
results=$2
prefix=$3
run_label=$4
cd "$repo"
python3 scripts/marker-bench-artifacts.py finalize "$results" "$prefix" --run-label "$run_label"
SH

for class in metrics quality restricted; do
  scp -p \
    "$AWS_HOST:${REMOTE_PREFIX}-${class}.tar.gz" \
    "$AWS_HOST:${REMOTE_PREFIX}-${class}.tar.gz.sha256" \
    "$LOCAL_RUN/"
  python3 scripts/marker-bench-artifacts.py verify \
    "$LOCAL_RUN/$(basename "${REMOTE_PREFIX}-${class}.tar.gz")" \
    --checksum "$LOCAL_RUN/$(basename "${REMOTE_PREFIX}-${class}.tar.gz.sha256")" \
    --receipt "$LOCAL_RUN/${class}.receipt.json" >/dev/null
done
cp scripts/marker-bench-artifacts.py "$LOCAL_RUN/"
chmod 0600 "$LOCAL_RUN/marker-bench-artifacts.py"

echo "local relay verified; transferring to homelab"
ssh -o BatchMode=yes "$HOMELAB_HOST" bash -s -- "$HOMELAB_DESTINATION" "$HOMELAB_STAGE" <<'SH'
set -euo pipefail
destination=$1
stage=$2
mkdir -p "$destination"
chmod 0700 "$destination"
if [[ -e "$stage" ]]; then
  echo "homelab staging path already exists" >&2
  exit 3
fi
mkdir "$stage"
chmod 0700 "$stage"
SH
scp -p "$LOCAL_RUN"/* "$HOMELAB_HOST:$HOMELAB_STAGE/"
ssh -o BatchMode=yes "$HOMELAB_HOST" bash -s -- "$HOMELAB_STAGE" "$HOMELAB_FINAL" "$RUN_LABEL" <<'SH'
set -euo pipefail
stage=$1
final=$2
run_label=$3
for class in metrics quality restricted; do
  python3 "$stage/marker-bench-artifacts.py" verify \
    "$stage/oghma-marker-${run_label}-${class}.tar.gz" \
    --checksum "$stage/oghma-marker-${run_label}-${class}.tar.gz.sha256" \
    --receipt "$stage/${class}.homelab-receipt.json" >/dev/null
done
if [[ -e "$final" ]]; then
  echo "homelab final path already exists" >&2
  exit 4
fi
mv "$stage" "$final"
SH

scp -p \
  "$HOMELAB_HOST:$HOMELAB_FINAL/metrics.homelab-receipt.json" \
  "$HOMELAB_HOST:$HOMELAB_FINAL/quality.homelab-receipt.json" \
  "$HOMELAB_HOST:$HOMELAB_FINAL/restricted.homelab-receipt.json" \
  "$LOCAL_RUN/"
python3 - "$LOCAL_RUN" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
for bundle_class in ("metrics", "quality", "restricted"):
    local = json.loads((root / f"{bundle_class}.receipt.json").read_text())
    remote = json.loads((root / f"{bundle_class}.homelab-receipt.json").read_text())
    for key in ("bundleClass", "runLabel", "bundleSha256", "manifestSha256", "files", "bytes"):
        if local.get(key) != remote.get(key):
            raise SystemExit(f"homelab receipt mismatch for {bundle_class}: {key}")
PY

echo "homelab verified; terminating AWS instance"
ssh -o BatchMode=yes "$AWS_HOST" \
  "rm -rf '$REMOTE_RESULTS' '${REMOTE_PREFIX}-metrics.tar.gz' '${REMOTE_PREFIX}-metrics.tar.gz.sha256' '${REMOTE_PREFIX}-quality.tar.gz' '${REMOTE_PREFIX}-quality.tar.gz.sha256' '${REMOTE_PREFIX}-restricted.tar.gz' '${REMOTE_PREFIX}-restricted.tar.gz.sha256'" \
  2>/dev/null || true
python3 scripts/marker-aws-session.py --config "$CONFIG" terminate "$INSTANCE_ID" \
  --region "$REGION" \
  --run-label "$RUN_LABEL" \
  --receipt "$LOCAL_RUN/metrics.homelab-receipt.json" \
  --receipt "$LOCAL_RUN/quality.homelab-receipt.json" \
  --receipt "$LOCAL_RUN/restricted.homelab-receipt.json" \
  --execute
rm -rf "$LOCAL_RUN"
echo "results verified on homelab and AWS instance terminated"
