#!/usr/bin/env bash
# EC2 user-data for g5.xlarge ASG instances (NVIDIA A10G GPU)
# deploys a real marker /marker/upload API used by src/lib/ocr.ts
set -euo pipefail

exec > /var/log/marker-setup.log 2>&1
echo "[$(date)] starting marker ASG instance setup"

yum install -y python3.11 python3.11-pip
PYTHON3="/usr/bin/python3.11"
echo "using python: $PYTHON3"
$PYTHON3 --version

mkdir -p /opt/marker

echo "installing marker dependencies in venv"
$PYTHON3 -m venv /opt/marker/.venv
/opt/marker/.venv/bin/pip install --upgrade pip
/opt/marker/.venv/bin/pip install "marker-pdf>=1.0.0" fastapi "uvicorn[standard]" python-multipart weasyprint python-pptx

cat > /opt/marker/server.py <<'PYEOF'
#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import tempfile
from pathlib import Path

import torch
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("marker-server")

app = FastAPI(title="Marker OCR Server", version="1.2.0")
_convert_lock = asyncio.Lock()
MARKER_SINGLE_BIN = os.getenv("MARKER_SINGLE_BIN", "/opt/marker/.venv/bin/marker_single")


def _run_marker_single(filepath: str) -> str:
    with tempfile.TemporaryDirectory(prefix="marker-out-") as out_dir:
        cmd = [
            MARKER_SINGLE_BIN,
            filepath,
            "--output_format",
            "markdown",
            "--output_dir",
            out_dir,
            "--paginate_output",
        ]

        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=1800,
            check=False,
        )

        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "marker_single failed")[:2000]
            raise RuntimeError(err)

        md_files = sorted(
            Path(out_dir).rglob("*.md"),
            key=lambda p: p.stat().st_size,
            reverse=True,
        )

        if not md_files:
            raise RuntimeError("marker_single completed but no markdown output was found")

        return md_files[0].read_text(encoding="utf-8", errors="replace")


@app.on_event("startup")
async def startup() -> None:
    logger.info("marker API starting")
    logger.info("torch cuda available: %s", torch.cuda.is_available())
    if torch.cuda.is_available():
        logger.info("gpu: %s", torch.cuda.get_device_name(0))
    logger.info("marker_single path: %s", MARKER_SINGLE_BIN)


@app.get("/")
async def health() -> dict[str, str]:
    return {"status": "healthy", "service": "marker-ocr"}


@app.post("/marker/upload")
async def marker_upload(
    file: UploadFile = File(...),
    output_format: str = Form("markdown"),
    paginate_output: str = Form("true"),
) -> JSONResponse:
    _ = paginate_output
    if output_format.lower() != "markdown":
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "only markdown output is supported"},
        )

    data = await file.read()
    if not data:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "empty file"},
        )

    suffix = Path(file.filename or "document.pdf").suffix or ".pdf"
    fd, temp_path = tempfile.mkstemp(prefix="marker-in-", suffix=suffix)
    os.close(fd)

    try:
        with open(temp_path, "wb") as handle:
            handle.write(data)

        logger.info("processing %s (%d bytes)", file.filename or "document", len(data))

        async with _convert_lock:
            text = await asyncio.to_thread(_run_marker_single, temp_path)

        return JSONResponse(content={"success": True, "output": text})
    except Exception as exc:  # noqa: BLE001
        logger.exception("marker extraction failed")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(exc)},
        )
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
PYEOF

chmod +x /opt/marker/server.py

cat > /etc/systemd/system/marker.service <<'SVCEOF'
[Unit]
Description=Marker OCR API Server (GPU)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/marker
Environment=PYTHONUNBUFFERED=1
Environment=TORCH_DEVICE=cuda
Environment=MARKER_SINGLE_BIN=/opt/marker/.venv/bin/marker_single
ExecStart=/opt/marker/.venv/bin/python /opt/marker/server.py
Restart=always
RestartSec=5
TimeoutStartSec=600
StandardOutput=journal
StandardError=journal
SyslogIdentifier=marker

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable marker
systemctl restart marker

echo "[$(date)] marker service started"
for i in {1..60}; do
  if curl -sSf http://127.0.0.1:8000/ > /dev/null; then
    echo "marker health check passed"
    break
  fi
  sleep 5
done

systemctl status marker --no-pager || true
echo "[$(date)] marker ASG instance setup complete"
