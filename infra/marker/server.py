#!/usr/bin/env python3
"""Marker OCR API compatible with /marker/upload used by app OCR client."""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from pathlib import Path

import torch
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from marker.converters.pdf import PdfConverter
from marker.models import create_model_dict
from marker.output import text_from_rendered

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("marker-server")

app = FastAPI(title="Marker OCR Server", version="1.1.0")

_converter = None
_init_lock = asyncio.Lock()
_convert_lock = asyncio.Lock()


def _build_converter() -> PdfConverter:
    logger.info("loading marker models")
    artifacts = create_model_dict()
    try:
        converter = PdfConverter(artifact_dict=artifacts)
    except TypeError:
        # compatibility with older marker versions
        converter = PdfConverter(model_dict=artifacts)
    logger.info("marker models ready")
    return converter


async def _ensure_converter() -> PdfConverter:
    global _converter
    if _converter is not None:
        return _converter

    async with _init_lock:
        if _converter is None:
            _converter = await asyncio.to_thread(_build_converter)
    return _converter


@app.on_event("startup")
async def startup() -> None:
    logger.info("marker API starting")
    logger.info("torch cuda available: %s", torch.cuda.is_available())
    if torch.cuda.is_available():
        logger.info("gpu: %s", torch.cuda.get_device_name(0))
    # warm in background so / health check is fast
    asyncio.create_task(_ensure_converter())


@app.get("/")
async def health() -> dict[str, str]:
    return {"status": "healthy", "service": "marker-ocr"}


@app.post("/marker/upload")
async def marker_upload(
    file: UploadFile = File(...),
    output_format: str = Form("markdown"),
    paginate_output: str = Form("true"),
) -> JSONResponse:
    _ = paginate_output  # accepted for API compatibility

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
    fd, temp_path = tempfile.mkstemp(prefix="marker-", suffix=suffix)
    os.close(fd)

    try:
        with open(temp_path, "wb") as handle:
            handle.write(data)

        converter = await _ensure_converter()
        logger.info("processing %s (%d bytes)", file.filename or "document", len(data))

        async with _convert_lock:
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
