#!/usr/bin/env python3
"""Local Marker++ backend fronted by Vast PyWorker.

The Vast request carries only short-lived object URLs and small metadata. The
source and full result remain in Oghma-owned object storage.
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import math
import multiprocessing
import os
import re
import subprocess
import tempfile
import threading
import time
import urllib.request
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from urllib.error import HTTPError
from uuid import UUID

from fastapi import FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from marker.config.parser import ConfigParser
from marker.converters.pdf import PdfConverter
from marker.models import create_model_dict
from marker.output import text_from_rendered
from marker.settings import settings


def positive_int(name: str, fallback: int) -> int:
    try:
        value = int(os.getenv(name, ""))
    except ValueError:
        return fallback
    return value if value > 0 else fallback


def bool_value(value: Any, fallback: bool = False) -> bool:
    if value is None:
        return fallback
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
API_PROCESSES = positive_int("MARKER_API_PROCESSES", 4)
ADMISSION_CONCURRENCY = positive_int("MARKER_ADMISSION_CONCURRENCY", 3)
PDFTEXT_WORKERS = positive_int("MARKER_PDFTEXT_WORKERS", 1)
MAX_SOURCE_BYTES = positive_int(
    "MARKER_MAX_SOURCE_BYTES",
    250 * 1024 * 1024,
)
MAX_RESULT_BYTES = positive_int(
    "MARKER_MAX_RESULT_BYTES",
    128 * 1024 * 1024,
)
TRANSFER_TIMEOUT_SECONDS = positive_int(
    "MARKER_TRANSFER_TIMEOUT_SECONDS",
    600,
)
TELEMETRY_INTERVAL_SECONDS = max(
    0.0,
    float(os.getenv("MARKER_TELEMETRY_INTERVAL_SECONDS", "1")),
)
BENCHMARK_PDF = Path("/app/benchmark.pdf")
ALLOWED_OUTPUT_FORMATS = {"markdown", "json", "html", "chunks"}
ALLOWED_OBJECT_HOSTS = {
    host.strip().lower()
    for host in os.getenv("MARKER_ALLOWED_OBJECT_HOSTS", "").split(",")
    if host.strip()
}

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("oghma-vast-marker")
admission = asyncio.Semaphore(ADMISSION_CONCURRENCY)
# Hosted vision remains fail-closed at one request regardless of an accidental
# higher environment value. Revalidate routing and provider limits before
# changing this code boundary.
vision_admission = asyncio.Semaphore(1)

_MODELS: Any = None
_POOL: ProcessPoolExecutor | None = None


def worker_event(name: str, **fields: Any) -> None:
    """Emit an exact line prefix for Vast LogActionConfig."""
    suffix = " ".join(f"{key}={value}" for key, value in fields.items())
    print(f"{name}{f' {suffix}' if suffix else ''}", flush=True)


def init_process() -> None:
    global _MODELS
    _MODELS = create_model_dict()


def worker_identity() -> int:
    if _MODELS is None:
        raise RuntimeError("Marker process models did not initialize")
    return os.getpid()


def get_pool() -> ProcessPoolExecutor:
    global _POOL
    if _POOL is None:
        _POOL = ProcessPoolExecutor(
            max_workers=API_PROCESSES,
            mp_context=multiprocessing.get_context("spawn"),
            initializer=init_process,
        )
    return _POOL


def build_converter(models: Any, options: dict[str, Any]) -> PdfConverter:
    parser = ConfigParser(options)
    config = parser.generate_config_dict()
    config["pdftext_workers"] = PDFTEXT_WORKERS
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


def convert_file(path: str, raw_options: dict[str, Any]) -> dict[str, Any]:
    if _MODELS is None:
        raise RuntimeError("Marker process models are unavailable")

    output_format = str(raw_options.get("outputFormat", "markdown")).lower()
    if output_format not in ALLOWED_OUTPUT_FORMATS:
        raise ValueError(f"unsupported output format: {output_format}")
    mode = str(raw_options.get("mode", "balanced"))
    if mode not in {"balanced", "fast"}:
        raise ValueError("mode must be balanced or fast")
    use_llm = bool_value(raw_options.get("useLlm"), False)
    options: dict[str, Any] = {
        "filepath": path,
        "page_range": raw_options.get("pageRange"),
        "force_ocr": bool_value(raw_options.get("forceOcr"), False),
        "paginate_output": bool_value(raw_options.get("paginateOutput"), False),
        "output_format": output_format,
        "mode": mode,
        "use_llm": use_llm,
        "describe_extracted_images": use_llm,
        "image_selection_policy": "semantic",
        "discard_unselected_images": True,
        "image_description_policy": "semantic" if use_llm else "off",
        "image_description_output": "alt",
        "llm_failure_mode": "raise",
        "llm_process_table_of_contents": False,
        "ocr_fallback_policy": str(
            raw_options.get("ocrFallbackPolicy", "auto")
        ),
        "table_ocr_policy": str(raw_options.get("tableOcrPolicy", "auto")),
        "profile_marker": bool_value(os.getenv("MARKER_PROFILE"), True),
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

    converter = build_converter(_MODELS, options)
    rendered = converter(path)
    text, _, images = text_from_rendered(rendered)
    return {
        "format": output_format,
        "output": text,
        "page_range": raw_options.get("pageRange"),
        "images": encode_images(images),
        "metadata": jsonable_encoder(getattr(rendered, "metadata", None)),
        "profile": jsonable_encoder(
            getattr(converter, "profile_summary", None)
        ),
        "success": True,
    }


def safe_error(error: BaseException) -> str:
    message = re.sub(r"https?://\S+", "[redacted-url]", str(error))
    return message[:1_000] or type(error).__name__


def validate_object_url(url: Any, field: str) -> str:
    if not isinstance(url, str) or not url:
        raise ValueError(f"{field} is required")
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError(f"{field} must use HTTPS")
    if not ALLOWED_OBJECT_HOSTS:
        raise ValueError("MARKER_ALLOWED_OBJECT_HOSTS is not configured")
    if parsed.hostname.lower() not in ALLOWED_OBJECT_HOSTS:
        raise ValueError(f"{field} host is not approved")
    return url


class ObjectRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        request: urllib.request.Request,
        file_pointer: Any,
        code: int,
        message: str,
        headers: Any,
        new_url: str,
    ) -> urllib.request.Request | None:
        validate_object_url(new_url, "redirectUrl")
        return super().redirect_request(
            request,
            file_pointer,
            code,
            message,
            headers,
            new_url,
        )


OBJECT_OPENER = urllib.request.build_opener(ObjectRedirectHandler())


def download(url: str, path: str) -> int:
    request = urllib.request.Request(url, method="GET")
    total = 0
    with OBJECT_OPENER.open(
        request,
        timeout=TRANSFER_TIMEOUT_SECONDS,
    ) as response:
        with open(path, "wb") as handle:
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_SOURCE_BYTES:
                    raise ValueError(
                        f"source exceeds MARKER_MAX_SOURCE_BYTES={MAX_SOURCE_BYTES}"
                    )
                handle.write(chunk)
    if total == 0:
        raise ValueError("source object is empty")
    return total


def upload(url: str, body: bytes) -> bool:
    request = urllib.request.Request(
        url,
        data=body,
        method="PUT",
        # The application presigns this header. A duplicate/late worker must
        # never overwrite the result envelope bound to a callback ID.
        headers={
            "Content-Type": "application/json",
            "If-None-Match": "*",
        },
    )
    try:
        with OBJECT_OPENER.open(
            request,
            timeout=TRANSFER_TIMEOUT_SECONDS,
        ) as response:
            response.read(1024)
        return True
    except HTTPError as error:
        # A successful sibling worker already committed the immutable result.
        # It is safe to acknowledge this request; the application will verify
        # the object against its expected request_id/result_key before use.
        if error.code == 412:
            return False
        raise


def validate_request_identity(payload: dict[str, Any]) -> tuple[str, str]:
    request_id = payload.get("requestId")
    result_key = payload.get("resultKey")
    if not isinstance(request_id, str):
        raise ValueError("requestId is required")
    try:
        canonical_request_id = str(UUID(request_id))
    except (TypeError, ValueError) as error:
        raise ValueError("requestId must be a canonical UUID") from error
    if request_id != canonical_request_id:
        raise ValueError("requestId must be a canonical UUID")
    expected_result_key = f"marker-results/{canonical_request_id}.json"
    if result_key != expected_result_key:
        raise ValueError("resultKey does not match requestId")
    return canonical_request_id, expected_result_key


def host_sample(started: float) -> dict[str, Any]:
    sample: dict[str, Any] = {"atSec": round(time.monotonic() - started, 3)}
    try:
        load1, load5, load15 = os.getloadavg()
        sample.update(
            {
                "load1": round(load1, 3),
                "load5": round(load5, 3),
                "load15": round(load15, 3),
                "cpuCount": os.cpu_count(),
            }
        )
        load_parts = Path("/proc/loadavg").read_text().split()
        runnable, total = load_parts[3].split("/", maxsplit=1)
        sample["runnableProcesses"] = int(runnable)
        sample["totalProcesses"] = int(total)
    except (OSError, ValueError, IndexError):
        pass
    try:
        row = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=utilization.gpu,utilization.memory,"
                "memory.used,power.draw",
                "--format=csv,noheader,nounits",
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout.strip().splitlines()[0].split(",")
        sample.update(
            {
                "gpuUtilPercent": float(row[0]),
                "gpuMemoryUtilPercent": float(row[1]),
                "gpuMemoryUsedMiB": float(row[2]),
                "gpuPowerWatts": float(row[3]),
            }
        )
    except (OSError, ValueError, IndexError, subprocess.SubprocessError):
        pass
    return sample


def sample_host(
    stop: threading.Event,
    started: float,
    samples: list[dict[str, Any]],
) -> None:
    while not stop.is_set():
        samples.append(host_sample(started))
        stop.wait(TELEMETRY_INTERVAL_SECONDS)


def mean(samples: list[dict[str, Any]], field: str) -> float | None:
    values = [
        float(sample[field])
        for sample in samples
        if isinstance(sample.get(field), (int, float))
        and math.isfinite(float(sample[field]))
    ]
    return round(sum(values) / len(values), 3) if values else None


def maximum(samples: list[dict[str, Any]], field: str) -> float | None:
    values = [
        float(sample[field])
        for sample in samples
        if isinstance(sample.get(field), (int, float))
        and math.isfinite(float(sample[field]))
    ]
    return round(max(values), 3) if values else None


def telemetry_summary(samples: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "intervalSeconds": TELEMETRY_INTERVAL_SECONDS,
        "sampleCount": len(samples),
        "load1Mean": mean(samples, "load1"),
        "runnableProcessesPeak": maximum(samples, "runnableProcesses"),
        "gpuUtilMeanPercent": mean(samples, "gpuUtilPercent"),
        "gpuUtilPeakPercent": maximum(samples, "gpuUtilPercent"),
        "gpuMemoryUsedPeakMiB": maximum(samples, "gpuMemoryUsedMiB"),
        "gpuPowerMeanWatts": mean(samples, "gpuPowerWatts"),
        "samples": samples,
    }


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not ALLOWED_OBJECT_HOSTS:
        raise RuntimeError("MARKER_ALLOWED_OBJECT_HOSTS is required")
    logger.info(
        "warming Marker backend processes=%s admission=%s",
        API_PROCESSES,
        ADMISSION_CONCURRENCY,
    )
    loop = asyncio.get_running_loop()
    process_ids: set[int] = set()
    deadline = time.monotonic() + positive_int(
        "MARKER_PROCESS_WARM_TIMEOUT_SECONDS",
        900,
    )
    while len(process_ids) < API_PROCESSES:
        process_ids.update(
            await asyncio.gather(
                *[
                    loop.run_in_executor(get_pool(), worker_identity)
                    for _ in range(API_PROCESSES * 2)
                ]
            )
        )
        if time.monotonic() >= deadline:
            raise RuntimeError(
                f"only {len(process_ids)}/{API_PROCESSES} Marker processes warmed"
            )
        if len(process_ids) < API_PROCESSES:
            await asyncio.sleep(0.25)
    logger.info("warmed Marker process ids=%s", len(process_ids))
    worker_event("MARKER_BACKEND_READY")
    try:
        yield
    finally:
        if _POOL is not None:
            _POOL.shutdown(wait=True, cancel_futures=True)


app = FastAPI(title="Oghma Vast Marker", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "healthy",
        "service": "oghma-vast-marker",
        "apiProcesses": API_PROCESSES,
        "admissionConcurrency": ADMISSION_CONCURRENCY,
        "hostedVisionConcurrency": 1,
    }


async def run_conversion(path: str, options: dict[str, Any]) -> dict[str, Any]:
    use_llm = bool_value(options.get("useLlm"), False)
    async with admission:
        if use_llm:
            async with vision_admission:
                return await asyncio.get_running_loop().run_in_executor(
                    get_pool(),
                    convert_file,
                    path,
                    options,
                )
        return await asyncio.get_running_loop().run_in_executor(
            get_pool(),
            convert_file,
            path,
            options,
        )


@app.post("/marker/job")
async def marker_job(payload: dict[str, Any]) -> JSONResponse:
    benchmark = bool_value(payload.get("benchmark"), False)
    if benchmark:
        request_id = "vast-readiness-benchmark"
        result_key = None
    else:
        try:
            request_id, result_key = validate_request_identity(payload)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
    options = payload.get("options")
    if not isinstance(options, dict):
        options = {}

    source_url: str | None = None
    result_url: str | None = None
    if benchmark:
        if not BENCHMARK_PDF.is_file():
            raise HTTPException(status_code=500, detail="benchmark PDF is missing")
        path = str(BENCHMARK_PDF)
        temporary = False
        source_bytes = BENCHMARK_PDF.stat().st_size
    else:
        try:
            source_url = validate_object_url(payload.get("sourceUrl"), "sourceUrl")
            result_url = validate_object_url(payload.get("resultUrl"), "resultUrl")
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        suffix = Path(str(payload.get("filename") or "document.pdf")).suffix.lower()
        if not suffix or len(suffix) > 16:
            suffix = ".pdf"
        descriptor, path = tempfile.mkstemp(prefix="marker-job-", suffix=suffix)
        os.close(descriptor)
        temporary = True
        try:
            source_bytes = await asyncio.to_thread(download, source_url, path)
        except Exception as error:
            if temporary:
                Path(path).unlink(missing_ok=True)
            message = safe_error(error)
            logger.error("Marker source download failed request=%s error=%s", request_id, message)
            return JSONResponse(
                status_code=502,
                content={"success": False, "error": message},
            )

    started = time.monotonic()
    samples: list[dict[str, Any]] = []
    stop = threading.Event()
    sampler: threading.Thread | None = None
    if TELEMETRY_INTERVAL_SECONDS > 0:
        sampler = threading.Thread(
            target=sample_host,
            args=(stop, started, samples),
            daemon=True,
        )
        sampler.start()

    try:
        result = await run_conversion(path, options)
        # The application accepts only this bound v1 envelope. Keep the
        # identifiers in the object that was uploaded, not only the transient
        # HTTP response, so it can reject a mismatched or overwritten result.
        result["schema_version"] = 1
        result["request_id"] = request_id
        result["result_key"] = result_key
        stop.set()
        if sampler:
            sampler.join(timeout=TELEMETRY_INTERVAL_SECONDS + 5)
        elapsed = round(time.monotonic() - started, 3)
        result["elapsedSec"] = elapsed
        result["sourceBytes"] = source_bytes
        result["telemetry"] = telemetry_summary(samples)

        if not benchmark:
            body = json.dumps(
                jsonable_encoder(result),
                separators=(",", ":"),
            ).encode("utf-8")
            if len(body) > MAX_RESULT_BYTES:
                raise ValueError(
                    f"result exceeds MARKER_MAX_RESULT_BYTES={MAX_RESULT_BYTES}"
                )
            created_result = await asyncio.to_thread(upload, result_url, body)

        worker_event(
            "MARKER_JOB_COMPLETE",
            request=request_id,
            elapsedSec=elapsed,
            sourceBytes=source_bytes,
            benchmark=benchmark,
        )
        return JSONResponse(
            content={
                "success": True,
                "requestId": request_id,
                "resultKey": result_key,
                "elapsedSec": elapsed,
                "sourceBytes": source_bytes,
                "resultAlreadyExisted": not benchmark and not created_result,
                "telemetry": {
                    key: value
                    for key, value in result["telemetry"].items()
                    if key != "samples"
                },
            }
        )
    except Exception as error:
        message = safe_error(error)
        logger.error(
            "Marker conversion failed request=%s error=%s",
            request_id,
            message,
        )
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": message},
        )
    finally:
        stop.set()
        if temporary:
            Path(path).unlink(missing_ok=True)
