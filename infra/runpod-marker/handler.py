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
import subprocess
import tempfile
import threading
import time
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from typing import Any, Mapping

import runpod
from marker.models import create_model_dict, shutdown_models

from oghma_marker.conversion import conversion_mode, convert_file
from oghma_marker.job import (
    allowed_object_hosts,
    build_result_envelope,
    download,
    positive_int_env,
    route_to_cpu,
    safe_error,
    upload,
    upload_suffix,
    validate_object_url,
    validate_request_identity,
)


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


def reset_pool() -> None:
    """Drop a pool whose child died so the next job builds a fresh one."""

    global _POOL
    pool, _POOL = _POOL, None
    if pool is not None:
        pool.shutdown(wait=False, cancel_futures=True)


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
    return convert_file(_MODELS, path, options)


async def run_conversion(path: str, options: Mapping[str, Any]) -> dict[str, Any]:
    try:
        return await asyncio.get_running_loop().run_in_executor(
            get_pool(), convert_job, path, options
        )
    except BrokenProcessPool:
        # a child died, usually out of memory. a broken executor never heals,
        # so without this every later job on this warm worker fails too
        reset_pool()
        raise


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

    suffix = upload_suffix(str(payload.get("filename") or "document.pdf"))
    descriptor, path = tempfile.mkstemp(prefix="marker-job-", suffix=suffix)
    os.close(descriptor)
    handler_started = time.monotonic()
    handler_received_unix_ms = round(time.time() * 1000)
    samples: list[dict[str, float]] = []
    stop = threading.Event()
    sampler: threading.Thread | None = None
    cpu_result_may_exist = False
    try:
        download_started = time.monotonic()
        await asyncio.to_thread(download, source_url, path)
        download_ms = duration_millis(download_started)

        conversion_mode(options)
        cpu_result, cpu_result_may_exist = await asyncio.to_thread(
            route_to_cpu, path, payload, options
        )
        if cpu_result is not None:
            return cpu_result

        if TELEMETRY_INTERVAL_SECONDS > 0:
            sampler = threading.Thread(target=sample_gpu, args=(stop, samples), daemon=True)
            sampler.start()

        conversion_started = time.monotonic()
        converted = await run_conversion(path, options)
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
        message = safe_error(error)
        if cpu_result_may_exist:
            # keep the app observing the immutable result key after a lost CPU reply
            print(f"marker-runtime event=cpu_result_pending request={request_id} error={message}", flush=True)
            return {"success": False, "resultPending": True, "requestId": request_id, "resultKey": result_key}
        raise RuntimeError(message) from None
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
    if not allowed_object_hosts():
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
