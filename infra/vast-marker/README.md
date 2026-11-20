# Vast Marker++ Serverless worker

Build the `gpu-vast` target from the [shared Dockerfile](../marker-worker/README.md).

```bash
VAST_MARKER_IMAGE=oghma-marker-worker:vast-2.2-cu129 bash scripts/build-vast-marker-image.sh
```

`vast-onstart.sh` runs the pinned Vast bootstrap and supervises the local
Marker API and Surya vLLM server. PyWorker has its own venv and forwards
`/marker/job` requests over HTTP. Set `MARKER_ALLOWED_OBJECT_HOSTS` to the
object-storage hostname. The API writes the bound v1 result to the signed
result URL.

Use the [Vast runbook](../../docs/operations/vast-marker.md) and
[serverless plan](serverless-plan.json) for template setup and rollout. The
`profiles/` examples record the portable 24 GB and PRO 6000 settings.
