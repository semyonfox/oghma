# syntax=docker/dockerfile:1.7

# This image is built from a deterministic Marker++ source archive created by
# scripts/package-marker-plus-plus.sh. It is not built or launched by Jenkins.
FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7

ARG MARKER_GPU_FAMILY=generic
ARG MARKER_CUDA_VARIANT=cu129
ARG VAST_PYWORKER_COMMIT=2e6e8a74a17c59595651f6919076147aed17bc23

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_CACHE_DIR=/root/.cache/pip \
    HF_HOME=/opt/marker-cache/huggingface \
    TORCH_HOME=/opt/marker-cache/torch \
    XDG_CACHE_HOME=/opt/marker-cache \
    TORCH_DEVICE=cpu \
    SURYA_INFERENCE_BACKEND=vllm \
    SURYA_INFERENCE_URL=http://127.0.0.1:8001/v1 \
    VLLM_DTYPE=bfloat16 \
    VLLM_NO_USAGE_STATS=1 \
    MARKER_PROFILE=1 \
    MARKER_PROFILE_LOG_EVENTS=0

WORKDIR /app

COPY constraints-vllm.txt /app/constraints-vllm.txt
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      gcc \
      libc6-dev \
      libgomp1 \
      openssl && \
    rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    if [ "$MARKER_CUDA_VARIANT" = "cu13" ]; then \
      python3 -m pip install \
        --constraint /app/constraints-vllm.txt \
        'https://github.com/vllm-project/vllm/releases/download/v0.20.1/vllm-0.20.1-cp38-abi3-manylinux_2_35_x86_64.whl'; \
    else \
      python3 -m pip install \
        --constraint /app/constraints-vllm.txt \
        --extra-index-url https://download.pytorch.org/whl/cu129 \
        'https://github.com/vllm-project/vllm/releases/download/v0.20.1/vllm-0.20.1%2Bcu129-cp38-abi3-manylinux_2_31_x86_64.whl'; \
    fi && \
    MARKER_CUDA_VARIANT="$MARKER_CUDA_VARIANT" python3 -c \
      'import os, torch, vllm; expected = "13.0" if os.environ["MARKER_CUDA_VARIANT"] == "cu13" else "12.9"; assert torch.version.cuda == expected; assert vllm.__version__ == "0.20.1"' && \
    if [ "$MARKER_GPU_FAMILY" = "nonblackwell" ]; then \
      find /usr/local/lib/python3.12/site-packages/flashinfer_cubin \
        -type d -name cubins -prune -exec rm -rf '{}' +; \
    fi

COPY requirements.txt /app/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    python3 -m venv --system-site-packages /opt/marker-venv && \
    /opt/marker-venv/bin/python -m pip install -r /app/requirements.txt

COPY prefetch_models.py /app/prefetch_models.py
RUN TORCH_DEVICE=cpu /opt/marker-venv/bin/python /app/prefetch_models.py && \
    chmod -R a+rX,u+w /opt/marker-cache

COPY marker-plus-plus.tar.gz /tmp/marker-plus-plus.tar.gz
COPY marker-plus-plus.tar.gz.sha256 /tmp/marker-plus-plus.tar.gz.sha256
COPY marker-plus-plus.manifest.json /app/marker-plus-plus.manifest.json
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    cd /tmp && sha256sum -c marker-plus-plus.tar.gz.sha256 && \
    /opt/marker-venv/bin/python -m pip install /tmp/marker-plus-plus.tar.gz && \
    /opt/marker-venv/bin/python -c 'from marker.util import download_font; download_font()' && \
    rm -f /tmp/marker-plus-plus.tar.gz && \
    find /opt/marker-venv -type d -name __pycache__ -prune -exec rm -rf '{}' +

ADD --checksum=sha256:cbfcf961b5cd953c6170d4574710273c85cca89532eaa5159e729b07c2432397 \
    https://raw.githubusercontent.com/vast-ai/pyworker/${VAST_PYWORKER_COMMIT}/start_server.sh \
    /app/vast-start-server.sh
ADD --checksum=sha256:909a8c7e2b33baa23fbc8f53ae7cc07273e2f5505e285cfd15c492ba27add826 \
    https://raw.githubusercontent.com/vast-ai/pyworker/${VAST_PYWORKER_COMMIT}/LICENSE.MIT \
    /usr/share/licenses/vast-pyworker/LICENSE.MIT
LABEL ie.oghmanotes.vast-pyworker.revision="${VAST_PYWORKER_COMMIT}"
COPY backend.py worker.py generate_benchmark_pdf.py start-backend.sh vast-onstart.sh /app/
RUN /opt/marker-venv/bin/python /app/generate_benchmark_pdf.py \
      /app/benchmark.pdf && \
    chmod +x \
      /app/start-backend.sh \
      /app/vast-onstart.sh \
      /app/vast-start-server.sh

ENTRYPOINT ["/app/vast-onstart.sh"]
