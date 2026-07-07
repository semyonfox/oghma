#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  RUNPOD_SSH_KEY=~/.ssh/runpod_marker_ed25519 \
  REPEAT=1 \
  npm run runpod:marker:quick -- <user@ssh.runpod.io>

Set MARKER_UVICORN_WORKERS on the RunPod template before starting the pod when
you want to test a different Marker worker count, for example 8 or 12 workers.

Environment:
  RUNPOD_SSH_KEY              SSH private key. Default: ~/.ssh/runpod_marker_ed25519
  MANAGE_MARKER               Restart Marker inside container. Default: 0
                               Keep this 0 for normal RunPod Marker containers.
  WORKER_COUNTS               Worker counts to test when MANAGE_MARKER=1. Default: 8
  CONCURRENCY_LEVELS          Request concurrency levels. Default: 4,8,12
  MATCH_WORKERS               Use each worker count as its concurrency when MANAGE_MARKER=1. Default: 0
  REPEAT                      Repeats of the PDF set per level. Default: 1
  MARKER_API_TOKEN            Optional token; generated remotely if unset.
  BENCH_URLS_FILE             Optional local file of signed PDF URLs.
  BENCH_ENV_FILE              Env file for signing R2 PDFs. Default: prod Jenkins env.
  BENCH_URL_LIMIT             Signed URL count when BENCH_URLS_FILE is unset. Default: 24
  PDF_LIMIT                   Max downloaded PDFs to benchmark. Default: 24
  PAGE_RANGE                  Marker page range, e.g. 0-2 for first 3 pages.
  TAIL                        Tail remote log after starting. Default: 1
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

TARGET="${1:-${RUNPOD_SSH_TARGET:-}}"
if [[ -z "$TARGET" ]]; then
  usage
  exit 1
fi

KEY="${RUNPOD_SSH_KEY:-$HOME/.ssh/runpod_marker_ed25519}"
WORKER_COUNTS="${WORKER_COUNTS:-8}"
CONCURRENCY_LEVELS="${CONCURRENCY_LEVELS:-4,8,12}"
MATCH_WORKERS="${MATCH_WORKERS:-0}"
MANAGE_MARKER="${MANAGE_MARKER:-0}"
REPEAT="${REPEAT:-1}"
TAIL="${TAIL:-1}"
MARKER_CONVERT_CONCURRENCY="${MARKER_CONVERT_CONCURRENCY:-1}"
MARKER_PDFTEXT_WORKERS="${MARKER_PDFTEXT_WORKERS:-1}"
PDF_LIMIT="${PDF_LIMIT:-24}"
PAGE_RANGE="${PAGE_RANGE:-}"
REMOTE_SCRIPT="/workspace/aggressive-bench.sh"
REMOTE_LOG="/workspace/oghma-marker-bench/aggressive-run.log"
BENCH_ENV_FILE="${BENCH_ENV_FILE:-/home/semyon/jenkins/env/oghma-prod.env}"
BENCH_URL_LIMIT="${BENCH_URL_LIMIT:-24}"
BENCH_URL_EXPIRES="${BENCH_URL_EXPIRES:-7200}"

if [[ ! -f "$KEY" ]]; then
  echo "SSH key not found: $KEY" >&2
  exit 1
fi

cleanup_files=()
if [[ -z "${BENCH_URLS_FILE:-}" ]]; then
  generated_urls="$(mktemp /tmp/oghma-marker-bench-urls.XXXXXX)"
  cleanup_files+=("$generated_urls")
  node scripts/generate-marker-bench-urls.mjs \
    --env "$BENCH_ENV_FILE" \
    --limit "$BENCH_URL_LIMIT" \
    --expires "$BENCH_URL_EXPIRES" \
    > "$generated_urls"
  BENCH_URLS_FILE="$generated_urls"
fi

PAYLOAD="$(base64 -w0 infra/runpod-marker/aggressive-bench.sh)"
URL_PAYLOAD=""
if [[ -n "${BENCH_URLS_FILE:-}" ]]; then
  URL_PAYLOAD="$(base64 -w0 "$BENCH_URLS_FILE")"
fi
LOCAL_TOKEN_B64=""
if [[ -n "${MARKER_API_TOKEN:-}" ]]; then
  LOCAL_TOKEN_B64="$(printf '%s' "$MARKER_API_TOKEN" | base64 -w0)"
fi

ssh -tt \
  -i "$KEY" \
  -o StrictHostKeyChecking=accept-new \
  -o BatchMode=yes \
  "$TARGET" <<REMOTE
set -euo pipefail
stty -echo 2>/dev/null || true
trap 'stty echo 2>/dev/null || true' EXIT
mkdir -p /workspace/oghma-marker-bench
cat > /workspace/aggressive-bench.sh.b64 <<'B64'
$PAYLOAD
B64
base64 -d /workspace/aggressive-bench.sh.b64 > "$REMOTE_SCRIPT"
chmod +x "$REMOTE_SCRIPT"
rm -f /workspace/aggressive-bench.sh.b64

if [[ -n "$URL_PAYLOAD" ]]; then
  cat > /workspace/oghma-marker-bench/bench-urls.txt.b64 <<'B64'
$URL_PAYLOAD
B64
  base64 -d /workspace/oghma-marker-bench/bench-urls.txt.b64 > /workspace/oghma-marker-bench/bench-urls.txt
  chmod 600 /workspace/oghma-marker-bench/bench-urls.txt
  rm -f /workspace/oghma-marker-bench/bench-urls.txt.b64
fi

if [[ -n "$LOCAL_TOKEN_B64" ]]; then
  export MARKER_API_TOKEN="\$(printf '%s' "$LOCAL_TOKEN_B64" | base64 -d)"
fi

if [[ -z "\${MARKER_API_TOKEN:-}" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    export MARKER_API_TOKEN="\$(openssl rand -hex 32)"
  else
    export MARKER_API_TOKEN="\$(python - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
)"
  fi
fi

printf '%s\n' "\$MARKER_API_TOKEN" > /workspace/oghma-marker-bench/marker-api-token.txt
chmod 600 /workspace/oghma-marker-bench/marker-api-token.txt

echo "marker API token saved to /workspace/oghma-marker-bench/marker-api-token.txt"
echo "WORKER_COUNTS=$WORKER_COUNTS"
echo "CONCURRENCY_LEVELS=$CONCURRENCY_LEVELS"
echo "MANAGE_MARKER=$MANAGE_MARKER"
echo "PDF_LIMIT=$PDF_LIMIT"
echo "PAGE_RANGE=${PAGE_RANGE:-<all>}"
echo "starting detached benchmark log=$REMOTE_LOG"

pkill -f aggressive-bench.sh || true
nohup env \
  MARKER_API_TOKEN="\$MARKER_API_TOKEN" \
  WORKER_COUNTS="$WORKER_COUNTS" \
  CONCURRENCY_LEVELS="$CONCURRENCY_LEVELS" \
  MATCH_WORKERS="$MATCH_WORKERS" \
  MANAGE_MARKER="$MANAGE_MARKER" \
  PDF_LIMIT="$PDF_LIMIT" \
  PAGE_RANGE="$PAGE_RANGE" \
  REPEAT="$REPEAT" \
  MARKER_CONVERT_CONCURRENCY="$MARKER_CONVERT_CONCURRENCY" \
  MARKER_PDFTEXT_WORKERS="$MARKER_PDFTEXT_WORKERS" \
  bash "$REMOTE_SCRIPT" \
  > "$REMOTE_LOG" 2>&1 < /dev/null &
echo "\$!" > /workspace/oghma-marker-bench/aggressive-run.pid
sleep 3
tail -n 80 "$REMOTE_LOG" || true
if [[ "$TAIL" == "1" ]]; then
  echo "tailing $REMOTE_LOG"
  tail -f "$REMOTE_LOG"
fi
REMOTE

if [[ "${#cleanup_files[@]}" -gt 0 ]]; then
  rm -f "${cleanup_files[@]}"
fi
