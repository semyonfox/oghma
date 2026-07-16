# Marker GPU Benchmark Handover

> **State:** Patched locally, deliberately not launched
>
> **Prepared:** 2026-07-16
>
> **Goal:** Produce trustworthy Marker/Marker++ cost and quality evidence on one temporary GPU at a time, move it to the homelab, and terminate AWS before review.

## Current design

The first AWS pass is an operator-driven batch benchmark over SSH-over-SSM. The
operator keeps separate terminals for the runner, `nvidia-smi`, telemetry, the
absolute shutdown timer, and AWS control-plane termination if the guest becomes
unhealthy.

The runner consumes [`benchmark-matrix.json`](../../infra/marker/benchmark-matrix.json)
and compares:

1. released Marker `1.10.2`;
2. Marker++ conservative at commit
   `2d66e45c0a1f8a3c081c6c96f47e1f7b6af2b03a`.

Marker++ fast is present but disabled until homelab quality review approves it.
HTTP concurrency and the dev import are later phases, not part of the first GPU
session.

One On-Demand instance runs at a time: `g4dn.xlarge` first, then `g5.xlarge` or
`g6.xlarge` only if the prior evidence leaves a meaningful question.

## What changed

- `marker-bench.py` owns the decision run instead of the upstream multi-file CLI.
  It records every document, validates page/output/metadata/image evidence,
  performs independent repeats, calculates p50/p95 and successful-page cost, and
  enforces failure/OOM/timeout/idle/deadline gates.
- Tracked released, conservative, and fast profiles remove ambiguity about what
  “Marker++” means. LLM/image descriptions and Marker profiling are excluded.
- The downloader records ordinal, bytes, SHA-256, time, and safe error categories.
  A private corpus attestation fixes bytes, hashes, page counts, and later private
  document-class labels.
- Telemetry now includes monotonic time, available RAM, host OOM-kill count, and
  resilient missing-GPU samples.
- A Marker++-only diagnostic command runs one worker/one repeat with 250 ms
  telemetry, stage events, source/layout overlays, block JSON, and final output.
  It is explicitly excluded from throughput rankings and retained for homelab
  optimization analysis.
- Results are split into a redacted metrics bundle and a restricted quality
  bundle containing all extracted outputs, metadata, images, and logs.
- Collection verifies both bundles locally and on the homelab, receives matching
  receipts, and only then terminates the exactly tagged instance. Human review
  happens after termination.
- AWS preflight now fails on root/wrong identity, quota, offering, or conflicting
  GPU state. Post-launch checks cover tags, public IP, IMDSv2, ingress, SSM,
  shutdown behavior, and delete-on-termination. Termination requires both
  homelab receipts. Audit fails on tagged leftovers.
- The guest has an absolute persistent systemd shutdown timer. EC2 must terminate
  on guest shutdown. A verified one-shot EventBridge Scheduler action is the
  independent control-plane deadline and remains authoritative if transfer fails.

## Private data path

The exact corpus selection remains ignored and mode `0600`. Never track AWS
account IDs, the maintainer UUID, object keys, signed URLs, credentials, source
PDFs, extracted personal content, operator aliases, or private run tags.

The completed operator config is based on
the template block in the runbook and lives at mode `0600` under ignored
`docs/internal/marker-benchmark/`.

Collection is:

`AWS instance → private control-host relay → verified homelab run → AWS termination`

No homelab key or address is placed on AWS. Both result bundles remain on the
homelab until manually deleted. Source PDFs are not bundled.

## Fixed source

Marker++ remains separate at `/home/semyon/code/personal/marker++`, branch
`oghma/perf-investigation`, pinned commit
`2d66e45c0a1f8a3c081c6c96f47e1f7b6af2b03a`. The packaging script archives the
committed tree only and records its tree, lock, archive, and commit fingerprints.
Do not modify or rebase that checkout during the experiment.

## Launch sequence

Use the detailed commands in
[`marker-gpu-benchmark.md`](marker-gpu-benchmark.md). The stage order is:

1. replace root AWS credentials with the intended non-root operator;
2. fill the ignored operator config and test both SSH aliases;
3. capture current On-Demand rate, absolute deadline, transfer buffer, and budget;
4. run preflight for `g4dn.xlarge`;
5. launch one private SSM-only instance with delete-on-termination and shutdown
   behavior `terminate`;
6. arm the guest deadline and pass post-launch checks;
7. transfer the pinned harness/builds and temporary URLs;
8. download, delete URLs, and verify the fixed private corpus attestation;
9. run released Marker and Marker++ conservative while watching live terminals;
10. collect and verify both bundles on the homelab;
11. terminate immediately and run the leftover audit;
12. review from the homelab before approving any next stage.

Do not improvise past a failed gate. Preserve partial numeric evidence, collect if
safe, terminate, and review from the homelab.

## Remaining launch blockers

No GPU should launch until all are true:

- `old-oghma` resolves to a non-root operator in the expected account;
- current offering, quota, price, maximum spend, and absolute deadline are
  approved;
- a preconfigured least-privilege EventBridge Scheduler role is recorded in the
  private operator config and the deadline schedule can be created and read;
- the AWS SSH-over-SSM alias and homelab alias/path work;
- a no-GPU synthetic bundle transfer produces matching homelab receipts;
- the selected AMI, installed package set, models, font, CUDA, and driver are
  pinned or captured before timing;
- the fixed corpus attestation has hashes/page counts and private class labels;
- the Marker++ archive/checksum/manifest and benchmark harness are transferred
  without unrelated dirty files;
- the instance launch sets no public IP/ingress, IMDSv2 required, SSM, encrypted
  gp3, delete-on-termination, exact project/run tags, and shutdown termination;
- post-launch and deadline checks pass before signed URLs are transferred.

## Interpretation

Report cold setup and warm extraction separately. Cost the whole launch-to-stop
interval, including warm-up, EBS, transfer, failures, and retries:

`USD/1,000 successful pages = total test cost / successful pages × 1,000`

Telemetry interpretation remains:

- high CPU and low GPU suggests preprocessing starvation;
- alternating CPU/GPU bands suggest pipeline bubbles;
- full VRAM with falling GPU use suggests memory pressure;
- concurrent CPU/GPU use with stable memory and rising pages/sec suggests useful
  overlap.

The winner is the cheapest configuration that passes manual quality review and
product latency requirements—not automatically the fastest GPU.

## Qwen3.5 vision handover

The Ollama academic runs are failure diagnostics excluded from rankings:
Marker swallowed processor failures, so ordinary Markdown did not prove vision
use. The replacement repository adapter sends strict OpenAI-compatible
JSON-schema requests and emits a document-fatal safe signal on terminal HTTP,
timeout, empty-response, schema, or model-identity failure. The harness also
requires nonzero successful calls and exact service/Marker metadata accounting.

No AWS, homelab or private-corpus access is part of implementation verification.
After fake-server, fake-Marker, syntax, redaction and archive tests pass, the
first real scope is the existing 24 opaque PDFs only. Run A10G sequentially:
Marker, unload Marker artifacts, start pinned Qwen/vLLM on loopback, then vision.
L40S is a later concurrent experiment. Preview pages 0–2 use one worker and one
repeat; any unhealthy preview blocks full documents. Thinking stays disabled in
the primary cell and needs a separately pinned diagnostic cell if investigated.

The primary A10G candidate is Qwen3.5-4B BF16 with a 16K context limit, at most
two images per request and one request at a time. Qwen3.5-9B BF16 remains a
disabled quality challenger for a later approved hard-case comparison; it is not
the default, and no unpinned quantized checkpoint is allowed.

The Marker++ package remains pinned to commit
`2d66e45c0a1f8a3c081c6c96f47e1f7b6af2b03a`; packaging adds only the tracked
`oghma_marker` adapter overlay and records its hash. Preserve clean and enhanced
Markdown/images/metadata separately. Final bundles are redacted metrics, safe
comparison quality, and private restricted content, each independently checked.
