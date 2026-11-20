# syntax=docker/dockerfile:1.7
FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7 AS marker-base

ENV PATH=/opt/marker-venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/opt/marker-cache/huggingface \
    XDG_CACHE_HOME=/opt/marker-cache \
    HF_XET_NUM_CONCURRENT_RANGE_GETS=2 \
    TORCH_DEVICE=cpu \
    MARKER_PROFILE=1 \
    MARKER_PROFILE_LOG_EVENTS=0

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates libgomp1 libpango-1.0-0 libpangoft2-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/marker-venv
ENV PIP_CACHE_DIR=/root/.cache/pip
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    --mount=type=bind,source=marker-plus-plus.tar.gz,target=/tmp/marker-plus-plus.tar.gz \
    --mount=type=bind,source=marker-plus-plus.tar.gz.sha256,target=/tmp/marker-plus-plus.tar.gz.sha256 \
    --mount=type=bind,source=marker-worker/constraints-marker.txt,target=/tmp/constraints-marker.txt \
    cd /tmp && sha256sum -c marker-plus-plus.tar.gz.sha256 && \
    python -m pip install --no-compile -c constraints-marker.txt \
      'marker-pdf[full] @ file:///tmp/marker-plus-plus.tar.gz' && \
    python -m pip check && \
    python -c 'from importlib.metadata import version; from importlib.util import find_spec; assert version("marker-pdf") == "2.2.1+markerpp.1"; assert find_spec("torch") is None'

COPY marker-worker/prefetch_models.py /app/prefetch_models.py
RUN python /app/prefetch_models.py indra && \
    HF_HUB_OFFLINE=1 python /app/prefetch_models.py indra && \
    chmod -R a+rX /opt/marker-cache

COPY marker-plus-plus.manifest.json /app/
ARG MARKER_PLUS_PLUS_COMMIT
LABEL org.opencontainers.image.revision="$MARKER_PLUS_PLUS_COMMIT"

FROM marker-base AS worker-base
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    --mount=type=bind,source=oghma_marker,target=/tmp/oghma_marker,rw \
    --mount=type=bind,source=marker-worker/constraints-marker.txt,target=/tmp/constraints-marker.txt \
    --mount=type=bind,source=marker-worker/requirements-http.txt,target=/tmp/requirements-http.txt \
    python -m pip install --no-compile -c /tmp/constraints-marker.txt \
      /tmp/oghma_marker -r /tmp/requirements-http.txt && \
    python -m pip check

FROM worker-base AS cpu
ENV HF_HUB_OFFLINE=1 \
    MARKER_CPU_ONLY=1 \
    MARKER_API_PROCESSES=1 \
    MARKER_ADMISSION_CONCURRENCY=1 \
    MARKER_TELEMETRY_INTERVAL_SECONDS=0
COPY vast-marker/backend.py /app/
EXPOSE 18000
CMD ["python", "-m", "uvicorn", "backend:app", "--host", "0.0.0.0", "--port", "18000"]

FROM worker-base AS gpu-base
ARG MARKER_CUDA_VARIANT=cu129
ARG MARKER_GPU_FAMILY=generic
ENV SURYA_INFERENCE_BACKEND=vllm \
    SURYA_INFERENCE_URL=http://127.0.0.1:8001/v1 \
    VLLM_DTYPE=bfloat16 \
    VLLM_NO_USAGE_STATS=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl gcc g++ libc6-dev openssl \
    && rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    --mount=type=bind,source=marker-worker/constraints-vllm.txt,target=/tmp/constraints-vllm.txt \
    /usr/local/bin/python -m venv /opt/vllm-venv && \
    if [ "$MARKER_CUDA_VARIANT" = "cu13" ]; then \
      /opt/vllm-venv/bin/python -m pip install --no-compile -c /tmp/constraints-vllm.txt \
        --extra-index-url https://download.pytorch.org/whl/cu130 \
        'torchcodec==0.16.0+cu130' \
        'https://github.com/vllm-project/vllm/releases/download/v0.25.1/vllm-0.25.1-cp38-abi3-manylinux_2_28_x86_64.whl'; \
    else \
      /opt/vllm-venv/bin/python -m pip install --no-compile -c /tmp/constraints-vllm.txt \
        --extra-index-url https://download.pytorch.org/whl/cu129 \
        'torchcodec==0.16.0+cu129' \
        'https://github.com/vllm-project/vllm/releases/download/v0.25.1/vllm-0.25.1%2Bcu129-cp38-abi3-manylinux_2_28_x86_64.whl'; \
    fi && \
    /opt/vllm-venv/bin/python -m pip check && \
    /opt/vllm-venv/bin/python -c 'import vllm.entrypoints.cli.serve' && \
    /opt/vllm-venv/bin/python -c 'import os, torch, vllm; expected = "13.0" if os.environ["MARKER_CUDA_VARIANT"] == "cu13" else "12.9"; assert torch.version.cuda == expected, torch.version.cuda; assert vllm.__version__.split("+", 1)[0] == "0.25.1"; assert torch.__file__.startswith("/opt/vllm-venv/")' && \
    cubin_package=/opt/vllm-venv/lib/python3.12/site-packages/flashinfer_cubin && \
    if [ "$MARKER_GPU_FAMILY" = "nonblackwell" ] && [ -d "$cubin_package" ]; then \
      find "$cubin_package" -type d -name cubins -prune -exec rm -rf '{}' +; \
    fi

RUN python /app/prefetch_models.py surya && \
    HF_HUB_OFFLINE=1 python /app/prefetch_models.py surya
ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

FROM gpu-base AS gpu-runpod
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    --mount=type=bind,source=runpod-marker/requirements.txt,target=/tmp/requirements.txt \
    --mount=type=bind,source=marker-worker/constraints-marker.txt,target=/tmp/constraints-marker.txt \
    python -m pip install --no-compile -c /tmp/constraints-marker.txt -r /tmp/requirements.txt && \
    python -m pip check
COPY runpod-marker/handler.py /app/
COPY --chmod=755 runpod-marker/run.sh /app/
CMD ["/app/run.sh"]

FROM gpu-base AS gpu-vast
ARG VAST_PYWORKER_COMMIT=2e6e8a74a17c59595651f6919076147aed17bc23
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    --mount=type=bind,source=vast-marker/requirements-pyworker.txt,target=/tmp/requirements-pyworker.txt \
    /usr/local/bin/python -m venv /opt/pyworker-venv && \
    /opt/pyworker-venv/bin/python -m pip install --no-compile -r /tmp/requirements-pyworker.txt && \
    /opt/pyworker-venv/bin/python -c 'import vastai'

ADD --checksum=sha256:cbfcf961b5cd953c6170d4574710273c85cca89532eaa5159e729b07c2432397 \
    https://raw.githubusercontent.com/vast-ai/pyworker/${VAST_PYWORKER_COMMIT}/start_server.sh \
    /app/vast-start-server.sh
ADD --checksum=sha256:909a8c7e2b33baa23fbc8f53ae7cc07273e2f5505e285cfd15c492ba27add826 \
    https://raw.githubusercontent.com/vast-ai/pyworker/${VAST_PYWORKER_COMMIT}/LICENSE.MIT \
    /usr/share/licenses/vast-pyworker/LICENSE.MIT
LABEL ie.oghmanotes.vast-pyworker.revision="$VAST_PYWORKER_COMMIT"
COPY vast-marker/backend.py vast-marker/worker.py vast-marker/generate_benchmark_pdf.py /app/
COPY --chmod=755 vast-marker/start-backend.sh vast-marker/vast-onstart.sh /app/
RUN python /app/generate_benchmark_pdf.py /app/benchmark.pdf && chmod +x /app/vast-start-server.sh
ENTRYPOINT ["/app/vast-onstart.sh"]
