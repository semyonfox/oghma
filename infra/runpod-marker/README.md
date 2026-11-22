# RunPod Marker++ Serverless worker

Build the `gpu-runpod` target from the [shared Dockerfile](../marker-worker/README.md).

```bash
npm run marker:runpod:validate
RUNPOD_MARKER_IMAGE=oghma-marker-worker:runpod-2.2-cu129 npm run marker:runpod:build
npm run test:marker
```

`run.sh` starts the local Surya vLLM server, waits for health, then starts
the queue handler. The handler accepts signed source and result URLs, writes
the bound v1 Markdown result to object storage and returns the callback
identity with scalar timing metrics. Set `MARKER_ALLOWED_OBJECT_HOSTS` to the
object-storage hostname.

The [RunPod runbook](../../docs/operations/runpod-marker.md) and
[serverless plan](serverless-plan.json) own the endpoint settings and rollout.
