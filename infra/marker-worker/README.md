# Marker++ worker images

Build Linux/AMD64 images from the repository root. The build script packages
Marker++ commit `e311c64` from the local clone. Set `MARKER_PLUS_PLUS_REPO` to
use another clone and `MARKER_PLUS_PLUS_COMMIT` to use another full commit SHA.

```bash
scripts/build-marker-worker-image.sh cpu oghma-marker-worker:cpu-e311c64
scripts/build-marker-worker-image.sh gpu-vast oghma-marker-worker:vast-e311c64-cu129
scripts/build-marker-worker-image.sh gpu-runpod --check
```

`marker-base` installs Marker++ 2.2.1 with the `full` extra, the rendering font
and Indra ONNX models. Both GPU targets add Surya 0.24's inference checkpoint
and isolate vLLM and its CUDA Torch build in `/opt/vllm-venv`. The Marker++
environment contains no Torch. Set `MARKER_CUDA_VARIANT=cu13` for the CUDA 13
variant, or `MARKER_GPU_FAMILY=nonblackwell` to omit the FlashInfer cubins the
non-Blackwell profile does not use.

The CPU target listens on port 18000. It exposes `GET /health` and
`POST /marker/job`, using the Vast job contract and requiring
`MARKER_ALLOWED_OBJECT_HOSTS`. It defaults to `fast` and also accepts `no_ocr`.
GPU workers also accept `balanced` (their default) and `vllm`.
PDF results include `page_kinds` and `suggested_route` in the v1 result metadata.
