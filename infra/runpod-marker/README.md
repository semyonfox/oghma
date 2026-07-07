# RunPod Marker

This is the repeatable RunPod setup for the OghmaNotes Marker OCR service.

## Recommended Template

Build and push the image from the repo root:

```bash
docker build --platform linux/amd64 \
  -f infra/runpod-marker/Dockerfile \
  -t <registry-user>/oghma-marker:v0.2-baked .

docker push <registry-user>/oghma-marker:v0.2-baked
```

Create a RunPod Pod template with:

```text
Container image: <registry-user>/oghma-marker:v0.2-baked
Container disk: 40 GB minimum, 80 GB preferred
Volume mount: /workspace
Expose HTTP ports: 8000
Expose TCP ports: 22
```

Environment variables:

```text
MARKER_API_TOKEN=<long random secret>
MARKER_UVICORN_WORKERS=8
MARKER_CONVERT_CONCURRENCY=1
MARKER_PDFTEXT_WORKERS=1
MARKER_MAX_UPLOAD_BYTES=262144000
```

Worker count starting points:

```text
H100 80 GB: start at 8, then test 4/12 if needed
B200/B20-class 180 GB: start at 8, then 12, then 16 only if 12 improves
B300 288 GB: do not jump to 40+ until 8/12/16 shows worker count is the limiter
```

Keep `MARKER_CONVERT_CONCURRENCY=1` unless a single uvicorn worker is under-using the GPU. Scale with `MARKER_UVICORN_WORKERS` first; each worker loads its own Marker model copy.

The baked image stores Marker model artifacts under `/opt/marker-cache`, so mounting a RunPod volume at `/workspace` for logs and benchmark PDFs will not hide the baked cache.

If `MARKER_UVICORN_WORKERS` is not set, the image auto-sizes from GPU VRAM at roughly one worker per 8 GB, capped by CPU count and 32 workers. Override it on expensive large-GPU pods when you already know the target.

For a B200/B20-class 180 GB pod, start with the measured-safe ladder:

```text
WORKER_COUNTS=8,12,16
CONCURRENCY_LEVELS=4,8,12
PDF_LIMIT=24
PAGE_RANGE=0-2
REPEAT=1
```

Then run the benchmark inside the pod:

```bash
WORKER_COUNTS=8,12,16 \
CONCURRENCY_LEVELS=4,8,12 \
PDF_LIMIT=24 \
PAGE_RANGE=0-2 \
REPEAT=1 \
bash /app/aggressive-bench.sh
```

## Stock RunPod Template Bootstrap

If you do not want to push an image, start from an official RunPod PyTorch template, expose HTTP port `8000`, attach a `/workspace` volume, clone this repo, then run:

```bash
cd /workspace/oghmanotes
MARKER_API_TOKEN=<long random secret> \
MARKER_UVICORN_WORKERS=8 \
nohup bash infra/runpod-marker/bootstrap.sh > /workspace/marker.log 2>&1 &

tail -f /workspace/marker.log
```

That installs Marker into the Pod and keeps Hugging Face/Torch caches under `/workspace/.cache` so a restarted Pod can warm much faster.

## Test From Local

RunPod HTTP proxy URLs use:

```text
https://<pod-id>-8000.proxy.runpod.net
```

Health check:

```bash
curl -sS https://<pod-id>-8000.proxy.runpod.net/health
```

Upload check:

```bash
curl -sS \
  -H "Authorization: Bearer $MARKER_API_TOKEN" \
  -F "file=@demo.pdf" \
  -F "output_format=markdown" \
  -F "paginate_output=false" \
  https://<pod-id>-8000.proxy.runpod.net/marker/upload
```

Benchmark:

```bash
MARKER_API_URL=https://<pod-id>-8000.proxy.runpod.net \
MARKER_API_TOKEN=<same secret> \
npm run benchmark:marker -- --concurrency 1,2,4,8 --repeat 2 ./demo-pdfs
```

RunPod's HTTP proxy has a 100-second Cloudflare request cap, so the proxy path is best for health checks and short preview OCR. For large documents, use direct TCP/SSH tunnel access or switch the app integration to an async job/status API.

## Oghma Worker Env

Set these in the Jenkins env file for the target stack when ready, then recreate only the worker container:

```text
MARKER_API_URL=https://<pod-id>-8000.proxy.runpod.net
MARKER_API_TOKEN=<same secret>
MARKER_FAST_PATH_MS=90000
MARKER_REQUEST_TIMEOUT_MS=90000
CANVAS_OCR_CONCURRENCY=4
```

Do not set timeouts above 100 seconds while using the RunPod HTTP proxy; Cloudflare will close the request before Oghma gets a Marker result. Longer full-document OCR needs direct TCP/tunnel access or async job polling.

## Monitor On RunPod

```bash
watch -n 1 nvidia-smi
nvidia-smi dmon -s pucvmet -d 1
```

For the custom-image template, use the RunPod Logs tab. For the stock-template bootstrap path:

```bash
tail -f /workspace/marker.log
```
