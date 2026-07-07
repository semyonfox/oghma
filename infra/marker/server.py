#!/usr/bin/env python3
"""Marker OCR API compatible with /marker/upload used by app OCR client."""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
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


@app.on_event("startup")
async def startup() -> None:
    import torch

    logger.info("marker API starting (concurrency=%d)", MARKER_CONCURRENCY)
    logger.info("torch cuda available: %s", torch.cuda.is_available())
    if torch.cuda.is_available():
        logger.info("gpu: %s", torch.cuda.get_device_name(0))
    # warm the pool in background so the / health check responds quickly
    asyncio.create_task(_pool.start())


@app.get("/")
async def health() -> dict[str, str]:
    return {"status": "healthy", "service": "marker-ocr"}


@app.post("/marker/upload")
async def marker_upload(
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

    try:
        with open(temp_path, "wb") as handle:
            handle.write(data)

        from marker.output import text_from_rendered

        logger.info("processing %s (%d bytes)", file.filename or "document", len(data))

        # Borrow a converter for exclusive use; this both bounds concurrency to the
        # pool size and guarantees no two requests touch the same model at once.
        async with _pool.acquire() as converter:
            rendered = await asyncio.to_thread(converter, temp_path)
            text, _, _ = await asyncio.to_thread(text_from_rendered, rendered)

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
