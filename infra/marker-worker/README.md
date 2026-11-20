# Marker++ worker images

Build Linux/AMD64 images from the repository root. The build script packages
Marker++ commit `1f6ecaafc210d257901daa6bfe0c43ad3a3eaedb` from the local
`feat/upstream-2.2` branch and records it in `/app/marker-plus-plus.manifest.json`.
Set `MARKER_PLUS_PLUS_REPO` to use another clone and `MARKER_PLUS_PLUS_COMMIT`
to use another full commit SHA.

```bash
scripts/build-marker-worker-image.sh cpu oghma-marker-worker:cpu-1f6ecaa
scripts/build-marker-worker-image.sh gpu-vast oghma-marker-worker:vast-1f6ecaa-cu129
scripts/build-marker-worker-image.sh gpu-runpod --check
```

`marker-base` installs Marker++ 2.2.1 with the `full` extra, the rendering font
and Indra ONNX models. Both GPU targets prefetch `datalab-to/surya-ocr-2.5` and
serve it with vLLM 0.25.1 and CUDA 12.9 in `/opt/vllm-venv`. The Marker++
environment contains no Torch. Set `MARKER_CUDA_VARIANT=cu13` for the CUDA 13
variant, or `MARKER_GPU_FAMILY=nonblackwell` to omit the FlashInfer cubins the
non-Blackwell profile does not use. CUDA graphs improve steady-state throughput
and increase startup time. Vast can use `VLLM_ENFORCE_EAGER=true` to skip graph
capture on cold starts.

The CPU target listens on port 18000. It exposes `GET /health` and
`POST /marker/job`, using the Vast job contract and requiring
`MARKER_ALLOWED_OBJECT_HOSTS`. It defaults to `fast` and also accepts `no_ocr`.
GPU workers default to `vllm`. They still accept `balanced`, `fast` and `no_ocr`.

`MARKER_CPU_ROUTE` defaults to `off`. To opt in, set it to `on` on the GPU
workers and set `MARKER_CPU_WORKER_URL` to the private CPU worker base URL.
Both workers need access to the signed object URL hosts. The GPU worker forwards
a PDF only when `marker_classify` reports `suggested_route == "cpu"` and
`math_glyph_pages == 0`. The CPU worker downloads the PDF and uses `fast` unless
the request explicitly selects `no_ocr`. Keep hosted vision settings in sync if
the GPU workers accept jobs with `useLlm`. PDF results from both workers include
`page_kinds` and `suggested_route` in the v1 result metadata.
