#!/usr/bin/env python3
"""Local Marker++ backend fronted by Vast PyWorker.

The Vast request carries only short-lived object URLs and small metadata. The
source and full result remain in Oghma-owned object storage.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import multiprocessing
import os
import subprocess
import tempfile
import threading
import time
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from marker.models import create_model_dict

from oghma_marker.conversion import conversion_mode, convert_file
from oghma_marker.job import (
    allowed_object_hosts,
    bool_option,
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


CPU_ONLY = bool_option(os.getenv("MARKER_CPU_ONLY"))
SERVICE = "oghma-cpu-marker" if CPU_ONLY else "oghma-vast-marker"
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
API_PROCESSES = positive_int_env("MARKER_API_PROCESSES", 4)
ADMISSION_CONCURRENCY = positive_int_env("MARKER_ADMISSION_CONCURRENCY", 3)
MAX_RESULT_BYTES = positive_int_env(
    "MARKER_MAX_RESULT_BYTES",
    128 * 1024 * 1024,
)
TELEMETRY_INTERVAL_SECONDS = max(
    0.0,
    float(os.getenv("MARKER_TELEMETRY_INTERVAL_SECONDS", "1")),
)
BENCHMARK_PDF = Path("/app/benchmark.pdf")
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(SERVICE)
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


def reset_pool() -> None:
    """Drop a pool whose child died so the next job builds a fresh one."""
    global _POOL
    pool, _POOL = _POOL, None
    if pool is not None:
        pool.shutdown(wait=False, cancel_futures=True)


def convert_job(path: str, options: dict[str, Any]) -> dict[str, Any]:
    if _MODELS is None:
        raise RuntimeError("Marker process models are unavailable")
    return convert_file(_MODELS, path, options, cpu_only=CPU_ONLY)


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
    if not allowed_object_hosts():
        raise RuntimeError("MARKER_ALLOWED_OBJECT_HOSTS is required")
    logger.info(
        "warming Marker backend processes=%s admission=%s",
        API_PROCESSES,
        ADMISSION_CONCURRENCY,
    )
    loop = asyncio.get_running_loop()
    process_ids: set[int] = set()
    deadline = time.monotonic() + positive_int_env(
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


app = FastAPI(title=SERVICE, version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "healthy",
        "service": SERVICE,
        "apiProcesses": API_PROCESSES,
        "admissionConcurrency": ADMISSION_CONCURRENCY,
        "hostedVisionConcurrency": 1,
    }


async def convert_in_pool(path: str, options: dict[str, Any]) -> dict[str, Any]:
    try:
        return await asyncio.get_running_loop().run_in_executor(
            get_pool(),
            convert_job,
            path,
            options,
        )
    except BrokenProcessPool:
        # a child died, usually out of memory. a broken executor never heals,
        # so without this every later job on this worker fails too
        reset_pool()
        raise


async def run_conversion(path: str, options: dict[str, Any]) -> dict[str, Any]:
    use_llm = bool_option(options.get("useLlm"), False)
    async with admission:
        if use_llm:
            async with vision_admission:
                return await convert_in_pool(path, options)
        return await convert_in_pool(path, options)


@app.post("/marker/job")
async def marker_job(payload: dict[str, Any]) -> JSONResponse:
    benchmark = bool_option(payload.get("benchmark"), False)
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
    try:
        conversion_mode(options, cpu_only=CPU_ONLY)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

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
        suffix = upload_suffix(str(payload.get("filename") or "document.pdf"))
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
        if not CPU_ONLY and not benchmark:
            cpu_result = await asyncio.to_thread(route_to_cpu, path, payload, options)
            if cpu_result is not None:
                return JSONResponse(content=cpu_result)
        converted = await run_conversion(path, options)
        result = build_result_envelope(converted, request_id, result_key)
        result["profile"] = converted["profile"]
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
