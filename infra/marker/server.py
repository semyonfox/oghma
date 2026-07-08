#!/usr/bin/env python3
"""Marker OCR API compatible with /marker/upload used by app OCR client."""

from __future__ import annotations

import asyncio
import hmac
import logging
import os
import tempfile
from pathlib import Path
from typing import Any, TYPE_CHECKING

import uvicorn
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi import status as http_status
from fastapi.responses import JSONResponse

from converter_pool import ConverterPool

if TYPE_CHECKING:  # heavy ML deps are imported lazily at runtime (see _build_converter)
    from marker.converters.pdf import PdfConverter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("marker-server")

app = FastAPI(title="Marker OCR Server", version="1.1.0")

# Number of converters (== model copies in VRAM == max concurrent conversions).
# Default 1 keeps the old serial behaviour; raise it to overlap one request's
# CPU stages with another request's GPU work. Size to what the GPU can hold.
MARKER_CONCURRENCY = max(1, int(os.getenv("MARKER_CONCURRENCY", "1")))


def marker_token() -> str:
    return os.getenv("MARKER_API_TOKEN", "").strip()


async def require_marker_token(
    authorization: str | None = Header(default=None),
    x_marker_token: str | None = Header(default=None),
) -> None:
    token = marker_token()
    if not token:
        return

    bearer_token = None
    if authorization:
        scheme, _, value = authorization.partition(" ")
        if scheme.lower() == "bearer" and value:
            bearer_token = value

    if bearer_token and hmac.compare_digest(bearer_token, token):
        return
    if x_marker_token and hmac.compare_digest(x_marker_token, token):
        return

    raise HTTPException(
        status_code=http_status.HTTP_401_UNAUTHORIZED,
        detail="invalid marker token",
    )


def _build_converter() -> "PdfConverter":
    # Imported here (not at module load) so the module can be imported without the
    # heavy torch/marker stack, e.g. for unit-testing the pool.
    from marker.converters.pdf import PdfConverter
    from marker.models import create_model_dict

    logger.info("loading marker models")
    artifacts = create_model_dict()
    try:
        converter = PdfConverter(artifact_dict=artifacts)
    except TypeError:
        # compatibility with older marker versions
        converter = PdfConverter(model_dict=artifacts)
    logger.info("marker models ready")
    return converter


_pool = ConverterPool(_build_converter, size=MARKER_CONCURRENCY)
_pool_ready = False
_pool_error: str | None = None
_pool_warm_task: asyncio.Task[None] | None = None


def _mark_pool_starting() -> None:
    global _pool_ready, _pool_error
    _pool_ready = False
    _pool_error = None


def _mark_pool_ready() -> None:
    global _pool_ready, _pool_error
    _pool_ready = True
    _pool_error = None


def _mark_pool_failed(exc: BaseException) -> None:
    global _pool_ready, _pool_error
    _pool_ready = False
    message = str(exc).strip() or exc.__class__.__name__
    _pool_error = message[:500]


async def _warm_pool() -> None:
    try:
        await _pool.start()
    except Exception as exc:  # noqa: BLE001
        _mark_pool_failed(exc)
        logger.exception("marker model pool failed to start")
    else:
        _mark_pool_ready()


def _health_response() -> JSONResponse:
    pool_status = "failed" if _pool_error else "ready" if _pool_ready else "starting"
    pool: dict[str, Any] = {
        "status": pool_status,
        "size": _pool.size,
        "available": _pool.available,
    }
    if _pool_error:
        pool["error"] = _pool_error

    return JSONResponse(
        status_code=200 if _pool_ready else 503,
        content={
            "status": pool_status,
            "service": "marker-ocr",
            "ready": _pool_ready,
            "auth": bool(marker_token()),
            "pool": pool,
        },
    )


@app.on_event("startup")
async def startup() -> None:
    global _pool_warm_task
    import torch

    logger.info("marker API starting (concurrency=%d)", MARKER_CONCURRENCY)
    logger.info("auth enabled: %s", bool(marker_token()))
    logger.info("torch cuda available: %s", torch.cuda.is_available())
    if torch.cuda.is_available():
        logger.info("gpu: %s", torch.cuda.get_device_name(0))
    # Warm the pool in the background so health responds quickly while still
    # reporting readiness/failure accurately.
    _mark_pool_starting()
    _pool_warm_task = asyncio.create_task(_warm_pool())


@app.get("/")
async def root_health() -> JSONResponse:
    return _health_response()


@app.get("/health")
async def health() -> JSONResponse:
    return _health_response()


@app.post("/marker/upload")
async def marker_upload(
    _: None = Depends(require_marker_token),
    file: UploadFile = File(...),
    output_format: str = Form("markdown"),
    paginate_output: str = Form("true"),
    page_range: str | None = Form(None),
) -> JSONResponse:
    _ = paginate_output  # accepted for API compatibility

    if output_format.lower() != "markdown":
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "only markdown output is supported"},
        )

    # the pooled converters are built without per-request config, so honouring
    # page_range here isn't possible. reject instead of silently returning the
    # full document — the runpod serving path supports page_range
    if page_range:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": "page_range is not supported by this marker server",
            },
        )

    data = await file.read()
    if not data:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "empty file"},
        )

    suffix = Path(file.filename or "document.pdf").suffix or ".pdf"
    fd, temp_path = tempfile.mkstemp(prefix="marker-", suffix=suffix)
    os.close(fd)
    pool_start_attempted = False

    try:
        with open(temp_path, "wb") as handle:
            handle.write(data)

        from marker.output import text_from_rendered

        logger.info("processing %s (%d bytes)", file.filename or "document", len(data))

        # Borrow a converter for exclusive use; this both bounds concurrency to the
        # pool size and guarantees no two requests touch the same model at once.
        pool_start_attempted = True
        async with _pool.acquire() as converter:
            _mark_pool_ready()
            rendered = await asyncio.to_thread(converter, temp_path)
            text, _, _ = await asyncio.to_thread(text_from_rendered, rendered)

        return JSONResponse(content={"success": True, "output": text})
    except Exception as exc:  # noqa: BLE001
        if pool_start_attempted and not _pool_ready:
            _mark_pool_failed(exc)
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
