# Marker++ worker images

Build Linux/AMD64 images from the repository root. The build script sets the
default `MARKER_PLUS_PLUS_COMMIT` and records the selected revision in
`/app/marker-plus-plus.manifest.json`. Set `MARKER_PLUS_PLUS_REPO` to use another
clone and `MARKER_PLUS_PLUS_COMMIT` to select another full commit SHA. When
changing the pin, compare `constraints-marker.txt` with the selected lockfile.

```bash
scripts/build-marker-worker-image.sh cpu oghma-marker-worker:cpu-2.2
scripts/build-marker-worker-image.sh gpu-vast oghma-marker-worker:vast-2.2-cu129
scripts/build-marker-worker-image.sh gpu-runpod --check
```

`marker-base` installs Marker++ 2.2.1 with the `full` extra, the rendering font
and pinned Indra ONNX models. Both GPU targets add pinned
`datalab-to/surya-ocr-2.5` weights and serve the baked snapshot with vLLM 0.25.1
and CUDA 12.9 in `/opt/vllm-venv`. The Dockerfile holds the model pins. The image
labels and manifest record the revisions each image includes.

The Marker++ environment contains no Torch. Set `MARKER_CUDA_VARIANT=cu13` for
the CUDA 13 variant, or `MARKER_GPU_FAMILY=nonblackwell` to omit the FlashInfer
cubins the non-Blackwell profile does not use. CUDA graphs improve steady-state
throughput and increase startup time. Vast can use `VLLM_ENFORCE_EAGER=true`
to skip graph capture on cold starts.

## GPU rollout

1. Keep the app on `MARKER_MODE=balanced` while deploying the new worker images
   to both RunPod and Vast. Marker 2.0 workers do not support `vllm`.
2. Verify readiness and run a test job with `mode: vllm` on each provider with
   CPU routing off. Check the stored result for `metadata.mode: vllm`, the
   conversion log for `mode=vllm`, and the image labels against the manifest.
3. Set the app's `MARKER_MODE=vllm` and verify an app-dispatched job.

To roll back, restore `MARKER_MODE=balanced` in the app first. Wait for queued
and in-flight `vllm` jobs to drain before restoring the previous worker images
on both providers.

## Optional CPU worker

The CPU target serves `GET /health` and `POST /marker/job` on port 18000.
It requires `MARKER_ALLOWED_OBJECT_HOSTS` and a bearer token set via
`MARKER_CPU_WORKER_TOKEN` for job requests. It defaults to `fast` and also accepts
`no_ocr`. GPU workers default to `vllm` and accept `balanced`, `fast` and
`no_ocr`.

`MARKER_CPU_ROUTE` defaults to `off`. After updating the app and both GPU
workers, set it to `on` on the GPU workers. Set `MARKER_CPU_WORKER_URL` to the
private CPU worker base URL and set
the same `MARKER_CPU_WORKER_TOKEN` on both workers. Use HTTPS if the connection
crosses hosts. Both workers need access to the signed object URL hosts. Keep
hosted vision settings in sync if the GPU workers accept jobs with `useLlm`.

The GPU worker forwards a PDF only when `marker_classify` recommends CPU and
finds no pages with unmapped maths glyphs. The CPU worker converts in `fast`
unless the request explicitly selects `no_ocr`. If classification or the CPU
request fails, the GPU worker converts using the original options. Both workers
write to the same result key with `If-None-Match: *`. If the CPU response is
lost after its upload, the GPU worker's upload gets a 412 and reports the
existing result. If the GPU uploads first, a late CPU upload leaves that result
in place. The app reads the stored result, whose metadata identifies the mode
that produced it. If the GPU fallback also fails after an ambiguous CPU
request, the app keeps checking storage for the CPU result until the existing
result deadline.

PDF results include `page_kinds` and `suggested_route` in the v1 result metadata
when the converted pages provide enough classification data. For a page range,
the metadata describes only those pages.
