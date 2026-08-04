#!/usr/bin/env python3
"""Vast PyWorker configuration for the local Marker backend."""

from __future__ import annotations

import math
import logging
import os
from pathlib import Path
from typing import Any

from vastai import BenchmarkConfig, HandlerConfig, LogActionConfig, Worker, WorkerConfig
from vastai.serverless.server.lib import backend as vast_backend


def positive_int(name: str, fallback: int) -> int:
    try:
        value = int(os.getenv(name, ""))
    except ValueError:
        return fallback
    return value if value > 0 else fallback


def workload(payload: dict[str, Any]) -> float:
    raw = payload.get("sourceBytes")
    try:
        source_bytes = float(raw)
    except (TypeError, ValueError):
        return 100.0
    if not math.isfinite(source_bytes) or source_bytes <= 0:
        return 100.0
    return max(25.0, min(2_000.0, round(source_bytes / (1024 * 1024) * 100)))


admission = positive_int("MARKER_ADMISSION_CONCURRENCY", 3)
backend_port = positive_int("MARKER_BACKEND_PORT", 18000)
benchmark_path = Path("/app/benchmark.pdf")

config = WorkerConfig(
    model_server_url="http://127.0.0.1",
    model_server_port=backend_port,
    model_log_file="/var/log/marker/backend.log",
    model_healthcheck_url="/health",
    handlers=[
        HandlerConfig(
            route="/marker/job",
            allow_parallel_requests=True,
            max_queue_time=float(os.getenv("MARKER_WORKER_MAX_QUEUE_SECONDS", "900")),
            workload_calculator=workload,
            benchmark_config=BenchmarkConfig(
                dataset=[
                    {
                        "benchmark": True,
                        "requestId": "vast-readiness-benchmark",
                        "sourceBytes": benchmark_path.stat().st_size,
                        "filename": "benchmark.pdf",
                        "options": {
                            "outputFormat": "markdown",
                            "mode": "balanced",
                            "ocrFallbackPolicy": "auto",
                            "tableOcrPolicy": "auto",
                            "useLlm": False,
                        },
                    }
                ],
                runs=positive_int("MARKER_BENCHMARK_RUNS", 2),
                concurrency=positive_int(
                    "MARKER_BENCHMARK_CONCURRENCY",
                    admission,
                ),
                do_warmup=True,
            ),
        )
    ],
    log_action_config=LogActionConfig(
        on_load=["MARKER_BACKEND_READY"],
        on_error=["MARKER_BACKEND_FATAL"],
        on_info=["MARKER_JOB_COMPLETE"],
    ),
)


if __name__ == "__main__":
    worker = Worker(config)
    # Vast SDK 1.5.0 sets its root logger to DEBUG and its backend forwarding
    # logger includes the complete request payload at that level. Our payload
    # contains short-lived signed object URLs, so keep that specific logger at
    # INFO while retaining ordinary PyWorker lifecycle and error logs.
    logging.getLogger(vast_backend.__file__).setLevel(logging.INFO)
    worker.run()
