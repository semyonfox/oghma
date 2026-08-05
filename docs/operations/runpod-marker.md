# RunPod Serverless Marker Runbook

> Status: Image published; production wiring is staged. A fresh registry
> credential, public Tunnel route, endpoint provisioning, and controlled smoke
> test remain live steps. Paid application dispatch is off.
>
> Audience: OghmaNotes operators and import-pipeline maintainers
>
> Last verified: 2026-08-05 against the current dispatcher, worker image,
> public-object-ingress design, and RunPod Serverless API documentation

RunPod is an optional second provider for the same Oghma-owned Marker queue.
It does not replace PostgreSQL job state, object storage, or the Canvas worker.
The current image digest is pinned in the endpoint plan. This runbook does not
by itself create an endpoint, add a secret, submit paid GPU work, or import a
Canvas file.

## Contract and provider choice

Set exactly one provider in a deployment:

```text
MARKER_SERVERLESS_PROVIDER=runpod
```

The app stays fail-closed until all of these are deliberately set in the
private runtime environment: `MARKER_OCR_ENABLED=true`,
`MARKER_SERVERLESS_DISPATCH_ENABLED=true`, `STORAGE_PUBLIC_ENDPOINT`, the
RunPod endpoint ID/API key, and the RunPod webhook token/base URL. The tracked
templates set both processing gates to `false`.

For each durable `app.marker_jobs` row, Oghma makes one asynchronous `/run`
submission. A lost response does not trigger a duplicate paid job: the row
moves to `awaiting_result` and observes the immutable
`marker-results/<callback UUID>.json` object. RunPod terminal webhooks and
status reads may advance or diagnose that same row, but full document text,
signed URLs, and provider payloads are never placed in PostgreSQL or a queue.
The v1 result object is validated before it can complete a note.

## Public signed-object ingress

RunPod workers use the shared public S3-compatible hostname only for their
short-lived signed source and result URLs:

```text
STORAGE_PUBLIC_ENDPOINT=https://objects.oghmanotes.ie
MARKER_ALLOWED_OBJECT_HOSTS=objects.oghmanotes.ie
```

The required production route is a Cloudflare Tunnel public hostname to the
existing Oghma Nginx container, then to the private RustFS S3 API. Nginx must
preserve the original `Host` header, path, query string, and `If-None-Match: *`
header, disable request/response caching and buffering, and avoid logging the
signed query string. Do not put Cloudflare Access or an interactive challenge
on this hostname: the short-lived S3 Signature V4 URL is the authorization.

The 250 MiB source limit is safe because a RunPod source download is a signed
`GET` response, not a Cloudflare upload. The result is a signed `PUT`, so the
worker defaults to a 90 MiB maximum result body (`94371840`) to remain below
[Cloudflare's default 100 MB proxied upload limit](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-413/).
A real smoke test must also measure result-upload throughput because
[Cloudflare's proxied origin write timeout is 30 seconds](https://developers.cloudflare.com/fundamentals/reference/connection-limits/).
Do not raise the result cap without first changing the public-ingress design or
verifying the active Cloudflare plan.

## GPU and image profile

Use the initial `ADA_24` profile (RTX 4090 class, 24 GB) only. `AMPERE_24`
remains documented as a possible future profile, but endpoint pool lists are
allow-lists rather than ordered fallbacks, so including it now could silently
select an unmeasured GPU. The selected Marker++ benchmark profile uses one
Surya vLLM process on the GPU, while the smaller OCR-error model is explicitly
on CPU. The endpoint stays at one GPU, zero minimum workers, one maximum
worker, and a five-second idle timeout. Those are cost guards, not a
throughput claim.

Create a RunPod v2 `QUEUE` endpoint with the pinned image, a fresh pull-only
GHCR registry credential, no selected data center, no network volume, and
these effective settings:

```text
GPU pool: ADA_24                 GPU count: 1
workers: 0 minimum / 1 maximum   idle timeout: 5 seconds
scaler: QUEUE_DELAY / 4 seconds  FlashBoot: FLASHBOOT
execution timeout: 1,800,000 ms  container disk: 20 GB
```

After creation, set the GPU selector to `ADA_24`, one GPU, and minimum CUDA
version `12.9`; this accepts newer compatible host drivers without allowing an
unmeasured GPU pool. Leave RunPod's data-center selection at its default. Do
not use `PRIORITY_FLASHBOOT`, add `AMPERE_24`, expose ports, or attach a
network volume for this profile.

Build the image only with a unique immutable tag:

```bash
RUNPOD_MARKER_IMAGE=<registry>/oghma-marker:2026-08-04-cu129 \
  npm run marker:runpod:build
docker push <registry>/oghma-marker:2026-08-04-cu129
```

Record the pushed digest in `infra/runpod-marker/serverless-plan.json` before
endpoint creation. The build script packages a verified Marker++ commit; the
Dockerfile pins its base image, checks package versions, fetches all required
public model assets at build time, verifies the cache offline, and warms the
Marker child process pool before accepting a job. Marker++/Surya keeps its
locked OpenCV 4.11 and Transformers 5.14 dependencies in the root interpreter;
the explicit `/opt/vllm-venv` command overlays vLLM's OpenCV 4.13 and
Transformers 5.7 dependencies while sharing the one CUDA 12.9 Torch layer.
Therefore a cold worker still pays RunPod scheduling, image distribution, GPU
startup, and local model initialization, but it does not clone source, install
packages, or download models.

## Metrics and observability

The app stores only safe scalar timing values. A RunPod job status can supply
`delayTime`, `executionTime`, `workerId`, and terminal state. The handler adds
`appSubmitToHandlerMs`, `containerToBackendReadyMs`,
`backendReadyToHandlerMs`, `sourceDownloadMs`, `conversionMs`,
`resultUploadMs`, and `handlerTotalMs`, plus aggregate GPU utilization/memory
samples. This makes the timing boundary explicit:

| Question | Source |
| --- | --- |
| Queue/capacity wait and job execution | RunPod status (`delayTime`, `executionTime`) and endpoint metrics |
| Image-to-local-backend readiness | `containerToBackendReadyMs` from the worker |
| Per-document download, conversion, and upload | Safe handler metrics saved with the durable Marker job |
| Cold-start percentiles and worker lifecycle | RunPod endpoint console metrics and logs |
| Final idle shutdown | RunPod endpoint lifecycle/logs; the worker cannot observe its own termination |

RunPod documents asynchronous `/run` requests, terminal job states, and
endpoint metrics separately: [send requests](https://docs.runpod.io/serverless/endpoints/send-requests),
[job states](https://docs.runpod.io/serverless/endpoints/job-states), and
[endpoint overview](https://docs.runpod.io/serverless/endpoints/overview).
Do not infer a shutdown time from a successful handler response; it is a
provider-side event after the job has completed.

Jenkins worker health checks validate database reachability, queue readiness,
and static Marker configuration only. They do not call RunPod or wake a GPU.
When serverless dispatch is enabled, the check also requires the separate
Marker dispatch consumer so queued work cannot be accepted without a worker to
claim it.

## Funding-time launch gates

1. Run the duplicate-data preflight for migrations 057 and 058, then deploy
   the code to development with the processing gates still `false`.
2. Add a new GHCR credential from a GitHub classic PAT with only
   `read:packages`, create the
   zero-minimum/one-maximum endpoint, set its minimum CUDA version, and read
   its image digest, registry-auth attachment, GPU selector, timeout,
   FlashBoot, disk, and environment back.
3. Store a newly created restricted RunPod endpoint key and distinct dev/prod
   webhook tokens only in owner-readable Jenkins env files. Configure the
   shared object hostname and environment-specific webhook base URLs, but keep
   `MARKER_OCR_ENABLED=false`, `MARKER_SERVERLESS_DISPATCH_ENABLED=false`, and
   `MARKER_PROCESS_ALL_PDFS=false` in both deployments.
4. With one non-private PDF, test one cold completion, one warm completion, a
   timeout/lost-response observation, a duplicate terminal webhook, and
   cancellation while the provider job is in flight. Record the safe metrics.
5. Separately verify Canvas import logic and output quality. Only after that
   approval may `MARKER_OCR_ENABLED` and the dispatch gate be enabled for a
   controlled import.

If a test fails, set `MARKER_SERVERLESS_DISPATCH_ENABLED=false`. Existing
ambiguous rows stay observable and are never automatically resubmitted.
