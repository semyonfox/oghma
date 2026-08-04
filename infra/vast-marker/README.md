# Vast Marker image

> Status: Build-ready, not built or deployed
>
> Last verified: 2026-07-28 against Marker++ commit
> `d31ecd2223588c8a2d014ece9d04fb99b0e45d57`, vLLM 0.20.1, and Vast SDK
> 1.5.0

This directory is the tracked, credential-free image source for the Oghma
Marker++ Vast Serverless worker. The deployment and rollback procedure is in
the [Vast Marker runbook](../../docs/operations/vast-marker.md).

The image has three local processes:

1. one shared Surya vLLM server on port 8001;
2. one FastAPI backend with a spawn-based Marker process pool on port 18000;
3. Vast PyWorker, which benchmarks the backend and exposes `/marker/job`.

`backend.py` enforces a single shared admission limit. This reproduces the
measured serving shape without starting multiple vLLM servers. It downloads
source PDFs and uploads full result JSON through signed object URLs; container
storage is temporary scratch only.

The checked Serverless plan keeps total workers at zero while idle, retains no
provider volume, prices the full 80 GB worker disk, and caps compute and
bandwidth offer costs. Volatile marketplace evidence remains in Marker++'s
[dated Vast cost decision](https://github.com/semyonfox/marker-plus-plus/blob/main/docs/benchmarks/2026-07-27-vast-serverless-cost.md);
the Oghma [operations runbook](../../docs/operations/vast-marker.md) owns
activation and rollback.

`/app/vast-onstart.sh` is the production image entrypoint. It starts the local
backend supervisor and the official Vast `start_server.sh`, pinned by commit
and SHA-256 in the Dockerfile. The official script generates the Vast worker
certificate, reports worker state, and launches the bundled `worker.py`.
Because `/opt/marker-venv` and `/app/worker.py` already exist, startup does not
clone `PYWORKER_REPO` or install dependencies.

## Source and image variants

`scripts/build-vast-marker-image.sh` creates the Marker++ archive from an exact
Git commit in a temporary context. No source archive or registry credential is
committed. The build is fixed to Linux/AMD64 for Vast and the Python base image
is pinned by OCI index digest.

- `MARKER_CUDA_VARIANT=cu129` is the portable 24 GB/non-Blackwell starting
  image.
- `MARKER_CUDA_VARIANT=cu13` is the PRO 6000/Blackwell image used with the
  measured 12-process, 10-admitted profile.
- `MARKER_GPU_FAMILY=nonblackwell` removes unused Blackwell FlashInfer cubins
  to reduce image size.

Example build only; it does not push or create Vast resources:

```bash
VAST_MARKER_IMAGE=registry.example/oghma-marker:2026-07-25-cu129 \
MARKER_CUDA_VARIANT=cu129 \
MARKER_GPU_FAMILY=nonblackwell \
bash scripts/build-vast-marker-image.sh
```

Use a unique, never-overwritten version tag. After pushing, configure the Vast
template with that tag and record its resolved registry digest for verification
and rollback; Vast's current template field is `repository/image:tag`. Use
Vast's **docker ENTRYPOINT** launch mode with blank arguments. Do not set
`PYWORKER_REPO` or an On-start command. For a temporary SSH diagnostic template
only, set its On-start command to `exec /app/vast-onstart.sh`, because SSH mode
replaces the image entrypoint.

## Capacity profiles

- `profiles/portable-24gb.env.example`: four Marker processes, three admitted
  conversions.
- `profiles/pro6000-cu13.env.example`: twelve Marker processes, ten admitted
  conversions—the measured large-document knee.

The PyWorker benchmark PDF is a deterministic readiness/warm-up input. It is
not representative cost evidence. Production tuning must use the separate
Marker++ corpus benchmark.

## Safety boundaries

- No Vast account key belongs in the image.
- `MARKER_ALLOWED_OBJECT_HOSTS` should be set to the public object-storage
  hostname in the Vast template.
- Hosted vision is hard-capped at one admitted conversion.
- The image does not persist inputs or results locally.
- Exact model-log prefixes tell Vast when the backend is ready or fatally
  unhealthy; the supervisor exits if either vLLM or the Marker API exits.
- Jenkins does not build, push, or deploy this image automatically.
- `jvastai_root.cer` is Vast's public worker TLS root, tracked for the Oghma
  Node worker at SHA-256
  `5960778b0ce081b391ca640a392259a2d9b3f87625d8d94c8cac04b1277a2afa`.
  Re-fetch and compare it with Vast's documented certificate URL whenever the
  SDK or platform certificate changes.
