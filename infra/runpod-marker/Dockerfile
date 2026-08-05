# syntax=docker/dockerfile:1.7

# This image is intentionally self-contained: it installs the exact Marker++
# source archive measured on the RTX 4090 at build time. Cold workers never
# clone, install packages, or download models.
FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7

ARG MARKER_GPU_FAMILY=nonblackwell
ARG MARKER_CUDA_VARIANT=cu129
ARG MARKER_PLUS_PLUS_COMMIT=d31ecd2223588c8a2d014ece9d04fb99b0e45d57

LABEL org.opencontainers.image.source="https://github.com/semyonfox/marker-plus-plus" \
  org.opencontainers.image.revision="${MARKER_PLUS_PLUS_COMMIT}" \
  org.opencontainers.image.description="OghmaNotes RunPod Serverless Marker++ worker with baked model assets"

ENTRYPOINT []

# The OCR-error model stays on CPU; vLLM remains the GPU inference server.
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
  PYTHONNOUSERSITE=1 \
  MARKER_PROFILE=1 \
  MARKER_PROFILE_LOG_EVENTS=0

WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  apt-get update && \
  apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gcc \
    libc6-dev \
    libgomp1 && \
  rm -rf /var/lib/apt/lists/*

COPY requirements.txt constraints-markerpp.txt /app/
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
  python3 -m pip install \
    --constraint /app/constraints-markerpp.txt \
    -r /app/requirements.txt

COPY marker-plus-plus.tar.gz marker-plus-plus.tar.gz.sha256 /tmp/
COPY marker-plus-plus.manifest.json /app/marker-plus-plus.manifest.json
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
  if [ "$MARKER_CUDA_VARIANT" = "cu13" ]; then \
    python3 -m pip install \
      'torch==2.11.0' \
      'torchvision==0.26.0'; \
  else \
    python3 -m pip install \
      --extra-index-url https://download.pytorch.org/whl/cu129 \
      'torch==2.11.0+cu129' \
      'torchvision==0.26.0+cu129'; \
  fi && \
  cd /tmp && \
  sha256sum -c marker-plus-plus.tar.gz.sha256 && \
  if [ "$MARKER_CUDA_VARIANT" = "cu13" ]; then \
    python3 -m pip install \
      --constraint /app/constraints-markerpp.txt \
      /tmp/marker-plus-plus.tar.gz; \
  else \
    python3 -m pip install \
      --extra-index-url https://download.pytorch.org/whl/cu129 \
      --constraint /app/constraints-markerpp.txt \
      /tmp/marker-plus-plus.tar.gz; \
  fi && \
  rm -f /tmp/marker-plus-plus.tar.gz /tmp/marker-plus-plus.tar.gz.sha256 && \
  python3 -m pip check && \
  MARKER_CUDA_VARIANT="$MARKER_CUDA_VARIANT" python3 -c 'from importlib.metadata import version; import cv2, os, torch, transformers; expected = "13.0" if os.environ["MARKER_CUDA_VARIANT"] == "cu13" else "12.9"; assert version("marker-pdf") == "2.0.0+markerpp.1"; assert version("surya-ocr") == "0.22.1"; assert cv2.__version__ == "4.11.0"; assert version("transformers") == "5.14.1"; assert torch.version.cuda == expected, (expected, torch.version.cuda)' && \
  python3 -c 'from marker.util import download_font; download_font()' && \
  find /usr/local/lib/python3.12/site-packages -type d -name __pycache__ -prune -exec rm -rf '{}' +

COPY prefetch_models.py /app/prefetch_models.py
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
  HF_HUB_OFFLINE=0 TRANSFORMERS_OFFLINE=0 TORCH_DEVICE=cpu \
    python3 /app/prefetch_models.py && \
  HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 TORCH_DEVICE=cpu \
    python3 /app/prefetch_models.py && \
  chmod -R a+rX,u+w /opt/marker-cache

COPY constraints-vllm.txt /app/constraints-vllm.txt
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
  python3 -m venv --system-site-packages /opt/vllm-venv && \
  if [ "$MARKER_CUDA_VARIANT" = "cu13" ]; then \
    /opt/vllm-venv/bin/python -m pip install \
      --constraint /app/constraints-vllm.txt \
      'https://github.com/vllm-project/vllm/releases/download/v0.20.1/vllm-0.20.1-cp38-abi3-manylinux_2_35_x86_64.whl'; \
  else \
    /opt/vllm-venv/bin/python -m pip install \
      --constraint /app/constraints-vllm.txt \
      --extra-index-url https://download.pytorch.org/whl/cu129 \
      'https://github.com/vllm-project/vllm/releases/download/v0.20.1/vllm-0.20.1%2Bcu129-cp38-abi3-manylinux_2_31_x86_64.whl'; \
  fi && \
  MARKER_CUDA_VARIANT="$MARKER_CUDA_VARIANT" /opt/vllm-venv/bin/python -c 'from importlib.metadata import version; import cv2, os, pathlib, torch, transformers, vllm; expected = "13.0" if os.environ["MARKER_CUDA_VARIANT"] == "cu13" else "12.9"; assert cv2.__version__ == "4.13.0"; assert version("transformers") == "5.7.0"; assert torch.version.cuda == expected, (expected, torch.version.cuda); assert vllm.__version__ == "0.20.1"; assert str(pathlib.Path(cv2.__file__)).startswith("/opt/vllm-venv/"); assert str(pathlib.Path(transformers.__file__)).startswith("/opt/vllm-venv/"); assert not str(pathlib.Path(torch.__file__)).startswith("/opt/vllm-venv/")' && \
  if [ "$MARKER_GPU_FAMILY" = "nonblackwell" ] && [ -d /opt/vllm-venv/lib/python3.12/site-packages/flashinfer_cubin ]; then \
    find /opt/vllm-venv/lib/python3.12/site-packages/flashinfer_cubin -type d -name cubins -prune -exec rm -rf '{}' +; \
  fi && \
  find /opt/vllm-venv -type d -name __pycache__ -prune -exec rm -rf '{}' + && \
  rm -rf /var/lib/apt/lists/*

# Triton compiles a small CUDA helper during vLLM's first runtime startup. The
# compiler and C headers above are deliberately retained so a cold Serverless
# worker can initialize without downloading packages or crash-looping.

ENV HF_HUB_OFFLINE=1 \
  TRANSFORMERS_OFFLINE=1

COPY server.py /app/server.py
COPY handler.py /app/handler.py
COPY run.sh /app/run.sh
RUN chmod +x /app/run.sh

CMD ["/app/run.sh"]
