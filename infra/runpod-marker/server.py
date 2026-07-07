#!/usr/bin/env python3
"""RunPod Marker API for OghmaNotes.

This intentionally does not use marker.scripts.server directly. The upstream
server is fine for local testing, but this wrapper avoids trusting upload
filenames, supports a bearer token, and keeps one conversion active per process
by default.
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import os
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import torch
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi import status as http_status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from marker.config.parser import ConfigParser
from marker.converters.pdf import PdfConverter
from marker.models import create_model_dict
from marker.output import text_from_rendered
from marker.settings import settings


def positive_int_env(name: str, fallback: int) -> int:
    raw = os.getenv(name, "")
    try:
        value = int(raw)
    except ValueError:
        return fallback
    return value if value > 0 else fallback


LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
MAX_UPLOAD_BYTES = positive_int_env("MARKER_MAX_UPLOAD_BYTES", 250 * 1024 * 1024)
CONVERT_CONCURRENCY = positive_int_env("MARKER_CONVERT_CONCURRENCY", 1)
PDFTEXT_WORKERS = positive_int_env("MARKER_PDFTEXT_WORKERS", 1)
ALLOWED_OUTPUT_FORMATS = {"markdown", "json", "html", "chunks"}

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("oghma-runpod-marker")
convert_semaphore = asyncio.Semaphore(CONVERT_CONCURRENCY)


def marker_token() -> str:
    return os.getenv("MARKER_API_TOKEN", "").strip()


async def require_marker_token(
    authorization: str | None = Header(default=None),
    x_marker_token: str | None = Header(default=None),
) -> None:
    token = marker_token()
    if not token:
        return
    if authorization == f"Bearer {token}" or x_marker_token == token:
        return
    raise HTTPException(
        status_code=http_status.HTTP_401_UNAUTHORIZED,
        detail="invalid marker token",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("starting Marker API")
    logger.info("torch cuda available: %s", torch.cuda.is_available())
    if torch.cuda.is_available():
        logger.info("gpu count: %s", torch.cuda.device_count())
        for index in range(torch.cuda.device_count()):
            logger.info("gpu %s: %s", index, torch.cuda.get_device_name(index))
    logger.info("convert concurrency per process: %s", CONVERT_CONCURRENCY)
    logger.info("max upload bytes: %s", MAX_UPLOAD_BYTES)
    logger.info("auth enabled: %s", bool(marker_token()))

    app.state.models = await asyncio.to_thread(create_model_dict)
    logger.info("Marker models loaded")
    try:
        yield
    finally:
        app.state.models = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


app = FastAPI(title="Oghma RunPod Marker", version="1.0.0", lifespan=lifespan)


def gpu_state() -> dict[str, Any]:
    if not torch.cuda.is_available():
        return {"cuda": False}

    devices = []
    for index in range(torch.cuda.device_count()):
        free_bytes, total_bytes = torch.cuda.mem_get_info(index)
        devices.append(
            {
                "index": index,
                "name": torch.cuda.get_device_name(index),
                "free_gb": round(free_bytes / 1024**3, 2),
                "total_gb": round(total_bytes / 1024**3, 2),
            },
        )
    return {"cuda": True, "devices": devices}


@app.get("/")
async def root() -> dict[str, Any]:
    return await health()


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "healthy",
        "service": "oghma-runpod-marker",
        "auth": bool(marker_token()),
        "convertConcurrency": CONVERT_CONCURRENCY,
        "pdftextWorkers": PDFTEXT_WORKERS,
        "gpu": gpu_state(),
    }


def upload_suffix(filename: str | None) -> str:
    suffix = Path(filename or "document.pdf").suffix.lower()
    if not suffix or len(suffix) > 16:
        return ".pdf"
    return suffix


def build_converter(models: Any, options: dict[str, Any]) -> PdfConverter:
    config_parser = ConfigParser(options)
    config_dict = config_parser.generate_config_dict()
    config_dict["pdftext_workers"] = PDFTEXT_WORKERS

    kwargs = {
        "config": config_dict,
        "processor_list": config_parser.get_processors(),
        "renderer": config_parser.get_renderer(),
        "llm_service": config_parser.get_llm_service(),
    }

    try:
        return PdfConverter(artifact_dict=models, **kwargs)
    except TypeError:
        return PdfConverter(model_dict=models, **kwargs)


def encode_images(images: dict[str, Any]) -> dict[str, str]:
    encoded: dict[str, str] = {}
    image_format = settings.OUTPUT_IMAGE_FORMAT
    for name, image in images.items():
        output_image = image
        if image_format.upper() in {"JPEG", "JPG"} and image.mode != "RGB":
            output_image = image.convert("RGB")
        byte_stream = io.BytesIO()
        output_image.save(byte_stream, format=image_format)
        encoded[name] = base64.b64encode(byte_stream.getvalue()).decode(
            settings.OUTPUT_ENCODING,
        )
    return encoded


def convert_file(
    models: Any,
    filepath: str,
    page_range: str | None,
    force_ocr: bool,
    paginate_output: bool,
    output_format: str,
) -> dict[str, Any]:
    options = {
        "filepath": filepath,
        "page_range": page_range,
        "force_ocr": force_ocr,
        "paginate_output": paginate_output,
        "output_format": output_format,
    }
    converter = build_converter(models, options)
    rendered = converter(filepath)
    text, _, images = text_from_rendered(rendered)
    metadata = getattr(rendered, "metadata", None)
    return {
        "format": output_format,
        "output": text,
        # echo the applied range so consumers of stored results can record
        # partial extraction coverage instead of assuming a full document
        "page_range": page_range,
        "images": encode_images(images),
        "metadata": jsonable_encoder(metadata),
        "success": True,
    }


@app.post("/marker/upload")
async def marker_upload(
    _: None = Depends(require_marker_token),
    page_range: str | None = Form(default=None),
    force_ocr: bool = Form(default=False),
    paginate_output: bool = Form(default=False),
    output_format: str = Form(default="markdown"),
    file: UploadFile = File(...),
) -> JSONResponse:
    normalized_format = output_format.lower()
    if normalized_format not in ALLOWED_OUTPUT_FORMATS:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": f"output_format must be one of {sorted(ALLOWED_OUTPUT_FORMATS)}",
            },
        )

    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "empty file"},
        )
    if len(data) > MAX_UPLOAD_BYTES:
        return JSONResponse(
            status_code=413,
            content={
                "success": False,
                "error": f"file exceeds MARKER_MAX_UPLOAD_BYTES={MAX_UPLOAD_BYTES}",
            },
        )

    fd, temp_path = tempfile.mkstemp(
        prefix="marker-in-",
        suffix=upload_suffix(file.filename),
    )
    os.close(fd)

    started = time.monotonic()
    try:
        with open(temp_path, "wb") as handle:
            handle.write(data)

        logger.info(
            "processing filename=%s bytes=%s format=%s",
            file.filename or "document",
            len(data),
            normalized_format,
        )
        async with convert_semaphore:
            result = await asyncio.to_thread(
                convert_file,
                app.state.models,
                temp_path,
                page_range,
                force_ocr,
                paginate_output,
                normalized_format,
            )

        elapsed = time.monotonic() - started
        result["elapsedSec"] = round(elapsed, 3)
        logger.info(
            "processed filename=%s elapsed=%.3fs output_chars=%s images=%s",
            file.filename or "document",
            elapsed,
            len(result.get("output") or ""),
            len(result.get("images") or {}),
        )
        return JSONResponse(content=jsonable_encoder(result))
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
