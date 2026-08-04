# RunPod Serverless Marker Runbook

> Status: Ready to provision; not live
>
> Audience: OghmaNotes operators and import-pipeline maintainers
>
> Last verified: 2026-08-04 against the current dispatcher, worker image, and
> RunPod Serverless API documentation

RunPod is an optional second provider for the same Oghma-owned Marker queue.
It does not replace PostgreSQL job state, object storage, or the Canvas worker.
No endpoint, image registry push, secret, paid GPU, or import is created by
this runbook.

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

## GPU and image profile

Use the initial `ADA_24` profile (RTX 4090 class, 24 GB) only. `AMPERE_24`
remains documented as a possible future profile, but endpoint pool lists are
allow-lists rather than ordered fallbacks, so including it now could silently
select an unmeasured GPU. The selected Marker++ benchmark profile uses one
Surya vLLM process on the GPU, while the smaller OCR-error model is explicitly
on CPU. The endpoint stays at one GPU, zero minimum workers, one maximum
worker, and a five-second idle timeout. Those are cost guards, not a
throughput claim.

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

## Funding-time launch gates

1. Run the duplicate-data preflight for migrations 057 and 058, then deploy
   the code to development with the processing gates still `false`.
2. Push the immutable image, create the zero-minimum/one-maximum endpoint, and
   read its effective GPU pool, idle timeout, FlashBoot, and environment back.
3. Configure the dev endpoint and webhook token. Keep
   `MARKER_PROCESS_ALL_PDFS=false`.
4. With one non-private PDF, test one cold completion, one warm completion, a
   timeout/lost-response observation, a duplicate terminal webhook, and
   cancellation while the provider job is in flight. Record the safe metrics.
5. Separately verify Canvas import logic and output quality. Only after that
   approval may `MARKER_OCR_ENABLED` and the dispatch gate be enabled for a
   controlled import.

If a test fails, set `MARKER_SERVERLESS_DISPATCH_ENABLED=false`. Existing
ambiguous rows stay observable and are never automatically resubmitted.
