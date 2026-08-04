#!/usr/bin/env python3
"""Shared Marker++ conversion primitives for the RunPod Serverless handler.

This module deliberately does not expose an HTTP server. The image runs only
the queue-based RunPod handler, which receives opaque IDs and signed object
URLs and writes a bound result envelope back to Oghma object storage.
"""

from __future__ import annotations

import base64
import io
import os
from pathlib import Path
from typing import Any

from fastapi.encoders import jsonable_encoder
from marker.config.parser import ConfigParser
from marker.converters.pdf import PdfConverter
from marker.output import text_from_rendered
from marker.settings import settings


def positive_int_env(name: str, fallback: int) -> int:
    try:
        value = int(os.getenv(name, ""))
    except ValueError:
        return fallback
    return value if value > 0 else fallback


def bool_option(value: Any, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value != 0
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off", ""}:
            return False
    return fallback


def upload_suffix(filename: str | None) -> str:
    suffix = Path(filename or "document.pdf").suffix.lower()
    return suffix if suffix and len(suffix) <= 16 else ".pdf"


def build_converter(models: Any, options: dict[str, Any]) -> PdfConverter:
    parser = ConfigParser(options)
    config = parser.generate_config_dict()
    config["pdftext_workers"] = positive_int_env("MARKER_PDFTEXT_WORKERS", 1)
    kwargs = {
        "config": config,
        "processor_list": parser.get_processors(),
        "renderer": parser.get_renderer(),
        "llm_service": parser.get_llm_service(),
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
        buffer = io.BytesIO()
        output_image.save(buffer, format=image_format)
        encoded[name] = base64.b64encode(buffer.getvalue()).decode(
            settings.OUTPUT_ENCODING
        )
    return encoded


def convert_file(
    models: Any,
    filepath: str,
    page_range: str | None,
    force_ocr: bool,
    paginate_output: bool,
    output_format: str,
    mode: str,
    ocr_fallback_policy: str,
    table_ocr_policy: str,
    use_llm: bool,
) -> dict[str, Any]:
    """Convert one document into the narrow v1-envelope payload fields."""

    if output_format.lower() != "markdown":
        raise ValueError("RunPod Serverless results must use markdown")
    if mode not in {"balanced", "fast"}:
        raise ValueError("mode must be balanced or fast")

    options: dict[str, Any] = {
        "filepath": filepath,
        "page_range": page_range,
        "force_ocr": force_ocr,
        "paginate_output": paginate_output,
        "output_format": "markdown",
        "mode": mode,
        "use_llm": use_llm,
        "describe_extracted_images": use_llm,
        "image_selection_policy": "semantic",
        "discard_unselected_images": True,
        "image_description_policy": "semantic" if use_llm else "off",
        "image_description_output": "alt",
        "llm_failure_mode": "raise",
        "llm_process_table_of_contents": False,
        "ocr_fallback_policy": ocr_fallback_policy,
        "table_ocr_policy": table_ocr_policy,
        "profile_marker": bool_option(os.getenv("MARKER_PROFILE"), True),
    }
    if use_llm:
        vision_target = os.getenv("MARKER_VISION_TARGET", "").strip()
        if not vision_target:
            raise ValueError("hosted vision was requested but is not configured")
        options.update(
            {
                "llm_service": (
                    "marker.services.openai_compatible_vision."
                    "OpenAICompatibleVisionService"
                ),
                "llm_target": vision_target,
                "llm_thinking": False,
                "timeout": 120,
                "max_retries": 2,
                "max_concurrency": 1,
            }
        )

    converter = build_converter(models, options)
    rendered = converter(filepath)
    text, _, images = text_from_rendered(rendered)
    return {
        "success": True,
        "format": "markdown",
        "output": text,
        "page_range": page_range,
        "images": encode_images(images),
        "metadata": jsonable_encoder(getattr(rendered, "metadata", None)),
    }
