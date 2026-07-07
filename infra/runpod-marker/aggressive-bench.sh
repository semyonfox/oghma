#!/usr/bin/env bash
set -euo pipefail

BENCH_DIR="${BENCH_DIR:-/workspace/oghma-marker-bench}"
BENCH_URLS_FILE="${BENCH_URLS_FILE:-$BENCH_DIR/bench-urls.txt}"
MARKER_URL="${MARKER_URL:-http://127.0.0.1:8000}"
MARKER_PORT="${MARKER_PORT:-8000}"
WORKER_COUNTS="${WORKER_COUNTS:-8}"
CONCURRENCY_LEVELS="${CONCURRENCY_LEVELS:-4,8,12}"
REPEAT="${REPEAT:-1}"
MATCH_WORKERS="${MATCH_WORKERS:-0}"
MANAGE_MARKER="${MANAGE_MARKER:-0}"
PDF_LIMIT="${PDF_LIMIT:-24}"
PAGE_RANGE="${PAGE_RANGE:-}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-900}"
MARKER_CONVERT_CONCURRENCY="${MARKER_CONVERT_CONCURRENCY:-1}"
MARKER_PDFTEXT_WORKERS="${MARKER_PDFTEXT_WORKERS:-1}"
MARKER_MAX_UPLOAD_BYTES="${MARKER_MAX_UPLOAD_BYTES:-262144000}"

mkdir -p "$BENCH_DIR"
cd "$BENCH_DIR"

cat > bench_marker.py <<'PY'
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import concurrent.futures
import json
import mimetypes
import os
import statistics
import time
import uuid
from pathlib import Path
from urllib import request


def pdf_pages(path: Path) -> int:
    try:
        import pypdfium2 as pdfium

        return len(pdfium.PdfDocument(path))
    except Exception:
        data = path.read_bytes()
        return max(1, data.count(b"/Type /Page") - data.count(b"/Type /Pages"))


def effective_pages(path: Path, page_range: str | None) -> int:
    total = pdf_pages(path)
    if not page_range:
        return total

    selected: set[int] = set()
    for part in page_range.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            if "-" in part:
                start_raw, end_raw = part.split("-", 1)
                start = int(start_raw)
                end = int(end_raw)
                if end < start:
                    start, end = end, start
                selected.update(page for page in range(start, end + 1) if 0 <= page < total)
            else:
                page = int(part)
                if 0 <= page < total:
                    selected.add(page)
        except ValueError:
            continue
    return len(selected)


def multipart(fields, files):
    boundary = "----oghma-" + uuid.uuid4().hex
    chunks = []
    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                str(value).encode(),
                b"\r\n",
            ],
        )
    for name, path in files.items():
        mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"; filename="{path.name}"\r\n'.encode(),
                f"Content-Type: {mime}\r\n\r\n".encode(),
                path.read_bytes(),
                b"\r\n",
            ],
        )
    chunks.append(f"--{boundary}--\r\n".encode())
    return boundary, b"".join(chunks)


def call_marker(url: str, token: str | None, path: Path, timeout: int, page_range: str | None):
    started = time.perf_counter()
    fields = {"output_format": "markdown", "paginate_output": "false"}
    if page_range:
        fields["page_range"] = page_range
    boundary, body = multipart(
        fields,
        {"file": path},
    )
    headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = request.Request(
        url.rstrip("/") + "/marker/upload",
        data=body,
        headers=headers,
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            status = res.status
        elapsed = time.perf_counter() - started
        parsed = json.loads(raw.decode("utf-8"))
        output = parsed.get("output") or ""
        return {
            "file": path.name,
            "ok": 200 <= status < 300 and parsed.get("success") is not False and bool(output),
            "status": status,
            "elapsed": elapsed,
            "chars": len(output),
            "pages": effective_pages(path, page_range),
            "error": parsed.get("error"),
        }
    except Exception as exc:
        return {
            "file": path.name,
            "ok": False,
            "status": getattr(exc, "code", 0),
            "elapsed": time.perf_counter() - started,
            "chars": 0,
            "pages": effective_pages(path, page_range),
            "error": str(exc),
        }


def percentile(values, p):
    if not values:
        return 0.0
    values = sorted(values)
    index = min(len(values) - 1, max(0, int(round((p / 100) * (len(values) - 1)))))
    return values[index]


def run_level(url, token, paths, concurrency, repeat, timeout, page_range):
    tasks = paths * repeat
    started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        results = list(pool.map(lambda p: call_marker(url, token, p, timeout, page_range), tasks))
    elapsed = time.perf_counter() - started
    ok = [r for r in results if r["ok"]]
    failed = [r for r in results if not r["ok"]]
    pages = sum(r["pages"] for r in ok)
    latencies = [r["elapsed"] for r in ok]
    return {
        "concurrency": concurrency,
        "requests": len(results),
        "ok": len(ok),
        "failed": len(failed),
        "pages": pages,
        "elapsed": elapsed,
        "pages_per_sec": pages / elapsed if elapsed else 0,
        "avg_latency": statistics.mean(latencies) if latencies else 0,
        "p95_latency": percentile(latencies, 95),
        "failures": failed[:5],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=os.environ.get("MARKER_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--token", default=os.environ.get("MARKER_API_TOKEN", ""))
    parser.add_argument("--concurrency", default="8,16,24")
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--page-range", default=os.environ.get("PAGE_RANGE", ""))
    parser.add_argument("files", nargs="+")
    args = parser.parse_args()

    paths = [Path(p) for p in args.files]
    print("files:", ", ".join(f"{p.name}({pdf_pages(p)}p)" for p in paths), flush=True)
    if args.page_range:
        print("page_range:", args.page_range, flush=True)
    print("conc\tok/req\tfailed\tpages\tsec\tpages/s\tavg_lat\tp95_lat", flush=True)
    summaries = []
    for level in [int(x) for x in args.concurrency.split(",") if x]:
        summary = run_level(args.url, args.token or None, paths, level, args.repeat, args.timeout, args.page_range or None)
        summaries.append(summary)
        print(
            f"{summary['concurrency']}\t{summary['ok']}/{summary['requests']}\t"
            f"{summary['failed']}\t{summary['pages']}\t{summary['elapsed']:.2f}\t"
            f"{summary['pages_per_sec']:.2f}\t{summary['avg_latency']:.2f}\t"
            f"{summary['p95_latency']:.2f}",
            flush=True,
        )
        for failure in summary["failures"]:
            print("failure", failure, flush=True)
    print("json:", json.dumps(summaries), flush=True)


if __name__ == "__main__":
    main()
PY
chmod +x bench_marker.py

download_pdf() {
  local url="$1"
  local name="$2"
  if [[ ! -s "$name" ]]; then
    curl -fsSL "$url" -o "$name"
  fi
}

download_pdf "https://raw.githubusercontent.com/semyonfox/oghma/dev/scripts/e2e/fixtures/sample-paper.pdf" "sample-paper.pdf"
download_pdf "https://raw.githubusercontent.com/semyonfox/oghma/dev/docs/SRS.pdf" "SRS.pdf"
download_pdf "https://raw.githubusercontent.com/semyonfox/oghma/dev/report.pdf" "report.pdf"

if [[ -s "$BENCH_URLS_FILE" ]]; then
  mkdir -p "$BENCH_DIR/incoming"
  index=0
  while IFS= read -r url; do
    [[ -z "$url" || "$url" == \#* ]] && continue
    index=$((index + 1))
    output="$BENCH_DIR/incoming/doc-$(printf '%04d' "$index").pdf"
    if [[ ! -s "$output" ]]; then
      curl -fL --retry 3 --retry-delay 2 "$url" -o "$output"
    fi
  done < "$BENCH_URLS_FILE"
fi

if compgen -G "$BENCH_DIR/incoming/*.pdf" >/dev/null; then
  mapfile -t PDFS < <(find "$BENCH_DIR/incoming" -maxdepth 1 -type f -iname '*.pdf' | sort)
else
  PDFS=("sample-paper.pdf" "SRS.pdf" "report.pdf")
fi

if [[ "$PDF_LIMIT" =~ ^[0-9]+$ && "$PDF_LIMIT" -gt 0 && "${#PDFS[@]}" -gt "$PDF_LIMIT" ]]; then
  PDFS=("${PDFS[@]:0:$PDF_LIMIT}")
fi

wait_for_marker() {
  local deadline=$((SECONDS + 900))
  until curl -fsS "$MARKER_URL/health" >/tmp/marker-health.json; do
    if (( SECONDS > deadline )); then
      echo "marker health timeout" >&2
      return 1
    fi
    sleep 5
  done
  cat /tmp/marker-health.json
  echo
}

restart_marker() {
  local workers="$1"
  echo "restarting marker with workers=$workers"
  pkill -f "uvicorn server:app" || true
  sleep 3
  cd /app
  export HF_HOME="${HF_HOME:-/workspace/.cache/huggingface}"
  export TORCH_HOME="${TORCH_HOME:-/workspace/.cache/torch}"
  export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/workspace/.cache}"
  export TORCH_DEVICE="${TORCH_DEVICE:-cuda}"
  export MARKER_UVICORN_WORKERS="$workers"
  export MARKER_CONVERT_CONCURRENCY
  export MARKER_PDFTEXT_WORKERS
  export MARKER_MAX_UPLOAD_BYTES
  nohup python -m uvicorn server:app \
    --host 0.0.0.0 \
    --port "$MARKER_PORT" \
    --workers "$workers" \
    --timeout-keep-alive 30 \
    --log-level info \
    > "$BENCH_DIR/marker-workers-${workers}.log" 2>&1 &
  cd "$BENCH_DIR"
  wait_for_marker
}

run_benchmark() {
  local label="$1"
  local bench_concurrency="$2"
  local monitor_log="$BENCH_DIR/gpu-${label}.log"
  local bench_log="$BENCH_DIR/bench-${label}.log"
  local page_range_args=()

  if [[ -n "$PAGE_RANGE" ]]; then
    page_range_args=(--page-range "$PAGE_RANGE")
  fi

  nvidia-smi dmon -s pucvmet -d 1 > "$monitor_log" 2>&1 &
  local monitor_pid="$!"
  echo "running benchmark label=$label concurrency=$bench_concurrency"
  python "$BENCH_DIR/bench_marker.py" \
    --url "$MARKER_URL" \
    --concurrency "$bench_concurrency" \
    --repeat "$REPEAT" \
    --timeout "$TIMEOUT_SECONDS" \
    "${page_range_args[@]}" \
    "${PDFS[@]}" \
    2>&1 | tee "$bench_log"
  kill "$monitor_pid" 2>/dev/null || true
  nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv || true
}

echo "bench dir: $BENCH_DIR"
echo "worker counts: $WORKER_COUNTS"
echo "concurrency levels: $CONCURRENCY_LEVELS"
echo "match workers: $MATCH_WORKERS"
echo "manage marker: $MANAGE_MARKER"
echo "pdf limit: $PDF_LIMIT"
echo "page range: ${PAGE_RANGE:-<all>}"
echo "repeat: $REPEAT"
echo "pdf count: ${#PDFS[@]}"
nvidia-smi || true

if [[ "$MANAGE_MARKER" == "1" ]]; then
  for workers in ${WORKER_COUNTS//,/ }; do
    restart_marker "$workers"
    if [[ "$MATCH_WORKERS" == "1" ]]; then
      bench_concurrency="$workers"
    else
      bench_concurrency="$CONCURRENCY_LEVELS"
    fi
    run_benchmark "workers-${workers}" "$bench_concurrency"
  done
else
  echo "using existing Marker process; set MARKER_UVICORN_WORKERS in the RunPod template to change workers"
  wait_for_marker
  run_benchmark "live" "$CONCURRENCY_LEVELS"
fi

echo "logs:"
ls -lh "$BENCH_DIR"/*.log
