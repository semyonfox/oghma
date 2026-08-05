#!/usr/bin/env python3
"""RunPod Serverless handler for one durable Marker++ document job.

The application gives this worker only an opaque callback UUID, a deterministic
result key, short-lived signed object URLs, and conversion options. Full output
never travels in the RunPod response: the worker writes a bound, immutable v1
result object to Oghma storage before returning a compact telemetry summary.
"""

from __future__ import annotations

import asyncio
import json
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
from typing import Any, Mapping
from urllib.error import HTTPError
from urllib.parse import urlsplit
from uuid import UUID

import runpod
from marker.models import create_model_dict, shutdown_models

from server import bool_option, convert_file, positive_int_env


MAX_SOURCE_BYTES = positive_int_env("MARKER_MAX_SOURCE_BYTES", 250 * 1024 * 1024)
# The default public object ingress is a Cloudflare-proxied hostname. Leave a
# margin below its 100 MB request ceiling for HTTP framing and provider drift.
DEFAULT_MAX_RESULT_BYTES = 90 * 1024 * 1024
MAX_RESULT_BYTES = positive_int_env("MARKER_MAX_RESULT_BYTES", DEFAULT_MAX_RESULT_BYTES)
HANDLER_CONCURRENCY = positive_int_env("MARKER_HANDLER_CONCURRENCY", 3)
WARM_TIMEOUT_SECONDS = positive_int_env("MARKER_PROCESS_WARM_TIMEOUT_SECONDS", 180)
TELEMETRY_INTERVAL_SECONDS = max(
    0.0,
    float(os.getenv("MARKER_TELEMETRY_INTERVAL_SECONDS", "1")),
)
MAX_APP_SUBMIT_TO_HANDLER_MS = positive_int_env(
    "MARKER_MAX_APP_SUBMIT_TO_HANDLER_MS", 43_200_000
)
HANDLER_PROCESS_STARTED_UNIX_MS = round(time.time() * 1000)
ALLOWED_OBJECT_HOSTS = {
    host.strip().lower()
    for host in os.getenv("MARKER_ALLOWED_OBJECT_HOSTS", "").split(",")
    if host.strip()
}
_MODELS: Any = None
_POOL: ProcessPoolExecutor | None = None

_SAFE_METRIC_FIELDS = {
    "appSubmitToHandlerMs",
    "containerToBackendReadyMs",
    "backendReadyToHandlerMs",
    "handlerProcessAgeMs",
    "sourceDownloadMs",
    "conversionMs",
    "handlerPreUploadMs",
    "resultUploadMs",
    "handlerTotalMs",
    "telemetryIntervalSeconds",
    "telemetrySampleCount",
    "gpuUtilMeanPercent",
    "gpuUtilPeakPercent",
    "memoryPeakMiB",
    "powerMeanWatts",
}


def duration_millis(started: float) -> int:
    return max(0, round((time.monotonic() - started) * 1000))


def optional_nonnegative_millis(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric) or numeric < 0:
        return None
    return round(numeric)


def sanitize_metrics(raw: Mapping[str, Any]) -> dict[str, int | float]:
    """Keep only finite content-free metrics in the provider response."""

    cleaned: dict[str, int | float] = {"schemaVersion": 1}
    for field in _SAFE_METRIC_FIELDS:
        value = raw.get(field)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        numeric = float(value)
        if math.isfinite(numeric) and numeric >= 0:
            cleaned[field] = round(numeric, 3)
    return cleaned


def validate_request_identity(payload: Mapping[str, Any]) -> tuple[str, str]:
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


def validate_object_url(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field} is required")
    parsed = urlsplit(value)
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
    return value


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
    total = 0
    with OBJECT_OPENER.open(
        urllib.request.Request(url, method="GET"),
        timeout=positive_int_env("MARKER_TRANSFER_TIMEOUT_SECONDS", 600),
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
    """Write once. A 412 means another worker already owns this result key."""

    request = urllib.request.Request(
        url,
        data=body,
        method="PUT",
        headers={
            "Content-Type": "application/json",
            "If-None-Match": "*",
        },
    )
    try:
        with OBJECT_OPENER.open(
            request,
            timeout=positive_int_env("MARKER_TRANSFER_TIMEOUT_SECONDS", 600),
        ) as response:
            response.read(1024)
        return True
    except HTTPError as error:
        if error.code == 412:
            return False
        raise


def init_worker() -> None:
    global _MODELS
    _MODELS = create_model_dict()


def worker_identity() -> int:
    if _MODELS is None:
        raise RuntimeError("Marker worker models are not initialized")
    return os.getpid()


def get_pool() -> ProcessPoolExecutor:
    global _POOL
    if _POOL is None:
        _POOL = ProcessPoolExecutor(
            max_workers=HANDLER_CONCURRENCY,
            mp_context=multiprocessing.get_context("spawn"),
            initializer=init_worker,
        )
    return _POOL


def warm_pool() -> None:
    """Load the lightweight Marker child processes before the first paid job."""

    pool = get_pool()
    process_ids: set[int] = set()
    deadline = time.monotonic() + WARM_TIMEOUT_SECONDS
    while len(process_ids) < HANDLER_CONCURRENCY:
        futures = [pool.submit(worker_identity) for _ in range(HANDLER_CONCURRENCY * 2)]
        for future in futures:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            process_ids.add(future.result(timeout=remaining))
        if time.monotonic() >= deadline:
            raise RuntimeError(
                f"only {len(process_ids)}/{HANDLER_CONCURRENCY} Marker processes warmed"
            )
    print(
        f"marker-runtime event=handler_warmed processes={len(process_ids)}",
        flush=True,
    )


def convert_job(path: str, options: Mapping[str, Any]) -> dict[str, Any]:
    if _MODELS is None:
        raise RuntimeError("Marker worker models are not initialized")
    return convert_file(
        _MODELS,
        path,
        options.get("pageRange"),
        bool_option(options.get("forceOcr"), False),
        bool_option(options.get("paginateOutput"), False),
        "markdown",
        str(options.get("mode", "balanced")),
        str(options.get("ocrFallbackPolicy", "auto")),
        str(options.get("tableOcrPolicy", "auto")),
        bool_option(options.get("useLlm"), False),
    )


def sample_gpu(stop: threading.Event, samples: list[dict[str, float]]) -> None:
    while not stop.is_set():
        try:
            row = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-gpu=utilization.gpu,memory.used,power.draw",
                    "--format=csv,noheader,nounits",
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=5,
            ).stdout.strip().splitlines()[0].split(",")
            samples.append(
                {
                    "gpuUtilPercent": float(row[0]),
                    "memoryUsedMiB": float(row[1]),
                    "powerWatts": float(row[2]),
                }
            )
        except (OSError, ValueError, IndexError, subprocess.SubprocessError):
            pass
        stop.wait(TELEMETRY_INTERVAL_SECONDS)


def telemetry_metrics(samples: list[dict[str, float]]) -> dict[str, int | float]:
    if not samples:
        return {
            "telemetryIntervalSeconds": TELEMETRY_INTERVAL_SECONDS,
            "telemetrySampleCount": 0,
        }
    return {
        "telemetryIntervalSeconds": TELEMETRY_INTERVAL_SECONDS,
        "telemetrySampleCount": len(samples),
        "gpuUtilMeanPercent": sum(sample["gpuUtilPercent"] for sample in samples)
        / len(samples),
        "gpuUtilPeakPercent": max(sample["gpuUtilPercent"] for sample in samples),
        "memoryPeakMiB": max(sample["memoryUsedMiB"] for sample in samples),
        "powerMeanWatts": sum(sample["powerWatts"] for sample in samples)
        / len(samples),
    }


def runtime_metrics(handler_received_unix_ms: int) -> dict[str, int]:
    metrics: dict[str, int] = {
        "handlerProcessAgeMs": max(
            0, handler_received_unix_ms - HANDLER_PROCESS_STARTED_UNIX_MS
        )
    }
    try:
        container_started = int(os.getenv("MARKER_CONTAINER_STARTED_AT_UNIX_MS", ""))
        backend_ready = int(os.getenv("MARKER_BACKEND_READY_AT_UNIX_MS", ""))
    except ValueError:
        return metrics
    if container_started >= 0 and backend_ready >= container_started:
        metrics["containerToBackendReadyMs"] = backend_ready - container_started
    if backend_ready <= handler_received_unix_ms:
        metrics["backendReadyToHandlerMs"] = handler_received_unix_ms - backend_ready
    return metrics


def app_submit_to_handler_millis(
    payload: Mapping[str, Any], handler_received_unix_ms: int
) -> int | None:
    submitted_at = optional_nonnegative_millis(payload.get("submittedAtUnixMs"))
    if submitted_at is None or submitted_at > handler_received_unix_ms:
        return None
    elapsed = handler_received_unix_ms - submitted_at
    return elapsed if elapsed <= MAX_APP_SUBMIT_TO_HANDLER_MS else None


def build_result_envelope(
    converted: Mapping[str, Any], request_id: str, result_key: str
) -> dict[str, Any]:
    output = converted.get("output")
    if not isinstance(output, str) or not output.strip():
        raise ValueError("Marker output is empty")
    return {
        "schema_version": 1,
        "request_id": request_id,
        "result_key": result_key,
        "success": True,
        "format": "markdown",
        "output": output,
        "page_range": converted.get("page_range"),
        "images": converted.get("images", {}),
        "metadata": converted.get("metadata"),
    }


def safe_error(error: Exception) -> str:
    """Avoid leaking signed object URLs through provider error logs/webhooks."""

    message = str(error)
    return re.sub(r"https?://[^\s'\"<>]+", "[redacted-url]", message)[:1_000]


async def handler(job: dict[str, Any]) -> dict[str, Any]:
    payload = job.get("input") or {}
    if not isinstance(payload, Mapping):
        raise ValueError("job.input must be an object")
    request_id, result_key = validate_request_identity(payload)
    source_url = validate_object_url(payload.get("sourceUrl"), "sourceUrl")
    result_url = validate_object_url(payload.get("resultUrl"), "resultUrl")
    options = payload.get("options") or {}
    if not isinstance(options, Mapping):
        raise ValueError("input.options must be an object")

    descriptor, path = tempfile.mkstemp(prefix="marker-job-", suffix=".pdf")
    os.close(descriptor)
    handler_started = time.monotonic()
    handler_received_unix_ms = round(time.time() * 1000)
    samples: list[dict[str, float]] = []
    stop = threading.Event()
    sampler: threading.Thread | None = None
    try:
        download_started = time.monotonic()
        await asyncio.to_thread(download, source_url, path)
        download_ms = duration_millis(download_started)

        if TELEMETRY_INTERVAL_SECONDS > 0:
            sampler = threading.Thread(target=sample_gpu, args=(stop, samples), daemon=True)
            sampler.start()

        conversion_started = time.monotonic()
        converted = await asyncio.get_running_loop().run_in_executor(
            get_pool(), convert_job, path, options
        )
        conversion_ms = duration_millis(conversion_started)
        stop.set()
        if sampler:
            sampler.join(timeout=TELEMETRY_INTERVAL_SECONDS + 1)

        metrics_raw: dict[str, Any] = {
            **runtime_metrics(handler_received_unix_ms),
            **telemetry_metrics(samples),
            "sourceDownloadMs": download_ms,
            "conversionMs": conversion_ms,
            "handlerPreUploadMs": duration_millis(handler_started),
        }
        app_submit_to_handler = app_submit_to_handler_millis(
            payload, handler_received_unix_ms
        )
        if app_submit_to_handler is not None:
            metrics_raw["appSubmitToHandlerMs"] = app_submit_to_handler

        envelope = build_result_envelope(converted, request_id, result_key)
        body = json.dumps(envelope, separators=(",", ":")).encode("utf-8")
        if len(body) > MAX_RESULT_BYTES:
            raise ValueError(f"result exceeds MARKER_MAX_RESULT_BYTES={MAX_RESULT_BYTES}")

        upload_started = time.monotonic()
        created_result = await asyncio.to_thread(upload, result_url, body)
        response_metrics = sanitize_metrics(
            {
                **metrics_raw,
                "resultUploadMs": duration_millis(upload_started),
                "handlerTotalMs": duration_millis(handler_started),
            }
        )
        return {
            "success": True,
            "requestId": request_id,
            "resultKey": result_key,
            "resultAlreadyExisted": not created_result,
            "metrics": response_metrics,
        }
    except Exception as error:
        raise RuntimeError(safe_error(error)) from None
    finally:
        stop.set()
        if sampler and sampler.is_alive():
            sampler.join(timeout=TELEMETRY_INTERVAL_SECONDS + 1)
        try:
            os.remove(path)
        except OSError:
            pass


def concurrency_modifier(_current_concurrency: int) -> int:
    return HANDLER_CONCURRENCY


if __name__ == "__main__":
    if not ALLOWED_OBJECT_HOSTS:
        raise RuntimeError("MARKER_ALLOWED_OBJECT_HOSTS is required")
    try:
        warm_pool()
        runpod.serverless.start(
            {"handler": handler, "concurrency_modifier": concurrency_modifier}
        )
    finally:
        if _POOL is not None:
            _POOL.shutdown(wait=True, cancel_futures=True)
        if _MODELS is not None:
            shutdown_models(_MODELS)
