"""Translate worker options into Marker++ 2.2 conversions."""

from __future__ import annotations

import base64
import io
import os
from typing import Any, Mapping

from fastapi.encoders import jsonable_encoder
from marker.classification import classify_pdf
from marker.config.parser import ConfigParser
from marker.converters.pdf import PdfConverter
from marker.output import text_from_rendered
from marker.providers.pdf import PdfProvider
from marker.providers.registry import provider_from_filepath
from marker.settings import settings

from .job import bool_option, positive_int_env


IMAGE_SELECTION_POLICIES = {"semantic", "course", "all"}


def image_selection_policy() -> str:
    # course keeps small uncaptioned lecture visuals (oghma#478). it needs a
    # Marker++ build that has the policy, so it stays opt-in per environment
    policy = os.getenv("MARKER_IMAGE_SELECTION_POLICY", "semantic").strip().lower()
    return policy if policy in IMAGE_SELECTION_POLICIES else "semantic"


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
    return PdfConverter(artifact_dict=models, **kwargs)


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


def conversion_mode(options: Mapping[str, Any], *, cpu_only: bool = False) -> str:
    mode = str(options.get("mode", "fast" if cpu_only else "vllm"))
    if mode not in {"no_ocr", "fast", "balanced", "vllm"}:
        raise ValueError("mode must be no_ocr, fast, balanced or vllm")
    if cpu_only and mode in {"balanced", "vllm"}:
        raise ValueError(f"mode {mode} requires a GPU worker. Use no_ocr or fast on CPU")
    return mode


def convert_file(
    models: Any, path: str, raw_options: Mapping[str, Any], *, cpu_only: bool = False
) -> dict[str, Any]:
    output_format = str(raw_options.get("outputFormat", "markdown")).lower()
    if output_format != "markdown":
        raise ValueError(f"unsupported output format: {output_format}")
    mode = conversion_mode(raw_options, cpu_only=cpu_only)
    use_llm = bool_option(raw_options.get("useLlm"), False)
    options: dict[str, Any] = {
        "filepath": path,
        "page_range": raw_options.get("pageRange"),
        "force_ocr": bool_option(raw_options.get("forceOcr"), False),
        "paginate_output": bool_option(raw_options.get("paginateOutput"), False),
        "output_format": output_format,
        "mode": mode,
        "use_llm": use_llm,
        "describe_extracted_images": use_llm,
        "image_selection_policy": image_selection_policy(),
        "discard_unselected_images": True,
        "image_description_policy": "semantic" if use_llm else "off",
        "image_description_output": "alt",
        "llm_failure_mode": "raise",
        "llm_process_table_of_contents": False,
        "ocr_fallback_policy": str(
            raw_options.get("ocrFallbackPolicy", "auto")
        ),
        "table_ocr_policy": str(raw_options.get("tableOcrPolicy", "auto")),
        "profile_marker": bool_option(os.getenv("MARKER_PROFILE"), True),
    }
    if use_llm:
        vision_target = os.getenv("MARKER_VISION_TARGET", "").strip()
        if not vision_target:
            raise ValueError("hosted vision was requested but is not configured")
        options.update(
            {
                "llm_service": "oghma_marker.services.OpenAICompatibleVisionService",
                "llm_target": vision_target,
                "llm_thinking": False,
                "timeout": 120,
                "max_retries": 2,
                "max_concurrency": 1,
            }
        )

    converter = build_converter(models, options)
    rendered = converter(path)
    text, _, images = text_from_rendered(rendered)
    metadata = jsonable_encoder(getattr(rendered, "metadata", None))
    if provider_from_filepath(path) is PdfProvider:
        classification = classify_pdf(path)
        metadata = {
            **(metadata or {}),
            "page_kinds": classification["pages"],
            "suggested_route": classification["suggested_route"],
        }
    return {
        "format": output_format,
        "output": text,
        "page_range": raw_options.get("pageRange"),
        "images": encode_images(images),
        "metadata": metadata,
        "profile": jsonable_encoder(
            getattr(converter, "profile_summary", None)
        ),
        "success": True,
    }
