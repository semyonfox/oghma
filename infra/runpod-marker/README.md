# RunPod Marker++ Serverless worker

This directory is the reproducible, credential-free worker definition for a
RunPod Serverless Marker++ endpoint. It is an endpoint setup only: it does not
create an endpoint, change Jenkins configuration, enable Marker in OghmaNotes,
or submit an import.

The initial production profile is intentionally narrow:

- primary GPU: `ADA_24` (the RTX 4090 class measured for Marker++);
- `AMPERE_24` is documented as a possible future fallback but is **not** in the
  initial endpoint; a pool list is an allow-list rather than a priority order,
  so including it could silently select an unmeasured GPU;
- one GPU, zero minimum workers, one maximum worker, and a five-second idle
  timeout; and
- `QUEUE_DELAY` scaling (four-second target), standard FlashBoot, a 20 GB
  container disk, and `RUNPOD_INIT_TIMEOUT=800` seconds; and
- the native HTTPS R2 S3 API hostname for signed source/result URLs, with a
  conservative 90 MiB result cap.

See [`serverless-plan.json`](serverless-plan.json) for the credential-free
endpoint values. The plan is not an API request by itself: attach the fresh
account-scoped GHCR pull credential through RunPod after reviewing it. It pins
the immutable image digest and intentionally leaves the data-center choice at
RunPod's default.

## Reproducible image

The build script packages and verifies exactly this Marker++ revision during
the build:

```text
d31ecd2223588c8a2d014ece9d04fb99b0e45d57
```

The script creates a deterministic archive from the local Marker++ repository,
verifies its commit and lockfile, and supplies only that archive to Docker. No
credential, working tree, or benchmark archive is part of the final image. The
Marker++/Surya root interpreter keeps its locked OpenCV 4.11 and Transformers
5.14 dependencies; `/opt/vllm-venv` overlays vLLM's OpenCV 4.13 and
Transformers 5.7 dependencies. Both use one shared CUDA 12.9 Torch layer, and
the entrypoint invokes each process by its explicit interpreter path. The
default image targets the 4090/24 GB non-Blackwell family and uses the portable
CUDA 12.9 runtime that was measured on the RTX 4090.

Triton compiles a small CUDA helper on a new worker's first vLLM startup. The
image therefore retains its C compiler and headers rather than attempting an
apt install during a paid cold start.

From the repository root, validate the prepared Docker context without building
an image:

```bash
npm run marker:runpod:validate
```

Build and publish only after choosing a registry and immutable tag outside the
repository:

```bash
RUNPOD_MARKER_IMAGE=<registry>/oghma-marker:<immutable-tag> \
  npm run marker:runpod:build
docker push <registry>/oghma-marker:<immutable-tag>
```

Record the resulting image digest with the endpoint configuration. The
Dockerfile also supports `MARKER_GPU_FAMILY=generic` for a deliberately
measured mixed/Blackwell pool; it is not the initial Serverless plan.

## Runtime contract

Set `MARKER_RUNTIME=serverless` (the default in
[`template.env.example`](template.env.example)). The entrypoint starts the
shared Surya/vLLM backend, waits for its health endpoint, emits safe timing
logs, then starts the RunPod queue handler. It defaults to three admitted jobs,
matching the measured RTX 4090 request-concurrency knee; this is not three
independent model servers.

Each job requires only short-lived signed URLs and ordinary metadata:

```json
{
  "input": {
    "requestId": "<canonical marker callback UUID>",
    "sourceUrl": "https://signed-input.example/…",
    "resultUrl": "https://signed-output.example/…",
    "resultKey": "marker-results/…",
    "filename": "document.pdf",
    "options": {
      "mode": "balanced",
      "useLlm": false
    },
    "submittedAtUnixMs": 0
  }
}
```

`submittedAtUnixMs` is optional. When the caller supplies an epoch-millisecond
timestamp, the worker records an app-submit-to-handler duration; no URL,
filename, document text, image, note ID, or user ID is copied into the metrics
object. `useLlm` defaults to `false` and is passed through correctly when it is
explicitly `true`. The initial endpoint does not configure hosted-vision
credentials, so keep it false unless a separately reviewed hosted-vision setup
is added.

Full extraction output remains in the signed object-storage result. The compact
RunPod response's `metrics` field contains only safe scalar values such as:

| Metric | Meaning | Boundary |
| --- | --- | --- |
| `appSubmitToHandlerMs` | Optional time from app submission to handler receipt | Includes queueing and may include provider startup; it is **not** a total provider cold-start measurement. |
| `containerToBackendReadyMs` | Entrypoint start through local vLLM health readiness | Excludes provider recruitment, image pull, and RunPod scheduling. |
| `backendReadyToHandlerMs` / `handlerProcessAgeMs` | How long the already-ready local worker waited before this job | Local worker timing only. |
| `sourceDownloadMs`, `conversionMs`, `resultUploadMs`, `handlerTotalMs` | Per-job transfer and conversion stages | `resultUploadMs` and final total are in the RunPod job response; pre-upload stages are also stored with the full result. |
| GPU aggregate fields | Sample count, GPU utilisation, peak memory, and mean power | One-second samples by default; no raw sample stream is returned. |

The worker cannot observe its own final provider shutdown after RunPod removes
it. Obtain shutdown/idle timing from RunPod endpoint status and logs, and keep
that separately from the local metrics above.

## Endpoint creation guardrails

Before any private document or full import:

1. Build one immutable image and record its digest.
2. Create or update the endpoint using `serverless-plan.json`, then set and
   read back the effective values: `ADA_24` only, one GPU, minimum CUDA 12.9,
   zero minimum, one maximum worker, five-second idle timeout, `QUEUE_DELAY`
   scaling with a four-second target, standard FlashBoot, 20 GB disk, and 800
   seconds init timeout. Leave locations, ports, and network volumes unset.
3. Run one non-private cold smoke request and one warm request. Capture the
   metrics boundary above plus RunPod’s endpoint state/timestamps. The image
   verifies its model cache offline during the build and warms its three Marker
   child processes before accepting a paid job, so neither step downloads
   packages or models at cold start. For Cloudflare R2, sign against the
   account S3 API hostname; R2 presigned URLs cannot use a custom domain or a
   Tunnel hostname.
4. Review output quality and import logic separately before enabling any
   application-side OCR or all-PDF routing.

This directory contains no API key, webhook token, signed URL, registry
credential, or deploy script. Do not put those values in this directory or
commit them.

## Local checks

The focused unit test uses fake imports, so it does not load Torch, Marker, or
RunPod and does not need GPU access:

```bash
PYTHONPYCACHEPREFIX=/tmp/runpod-marker-pycache \
  python3 -m unittest infra/runpod-marker/test_handler.py
PYTHONPYCACHEPREFIX=/tmp/runpod-marker-pycache \
  python3 -m py_compile infra/runpod-marker/handler.py infra/runpod-marker/server.py infra/runpod-marker/prefetch_models.py
bash -n infra/runpod-marker/run.sh
```

The repository intentionally ignores old local image archives, benchmark
scratch, baseline Dockerfiles, and bootstrap scripts. They are not valid inputs
to a fresh Serverless build.
