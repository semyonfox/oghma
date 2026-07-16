# Marker GPU Benchmark

> **Status:** Prepared operator-driven test; no AWS resources are provisioned
>
> **Last reviewed:** 2026-07-16
>
> **Scope:** Released Marker versus Marker++ on temporary On-Demand EC2 GPUs

## Objective

Find the cheapest configuration that produces acceptable Oghma extraction output.
Use successful pages, latency, failures, output review, and the whole billable
session—not peak GPU throughput alone.

The first pass is a batch test controlled over SSH-over-SSM. HTTP concurrency and
a dev import happen only after a batch winner exists. Human review happens from
the homelab after AWS has been terminated.

## Fixed contract

[`benchmark-matrix.json`](../../infra/marker/benchmark-matrix.json) is consumed by
the batch runner. It defines:

- released Marker `1.10.2` with its released-default profile;
- Marker++ commit `2d66e45c0a1f8a3c081c6c96f47e1f7b6af2b03a` with the conservative profile;
- the Marker++ fast born-digital profile, disabled until quality review approves it;
- preview pages `0-2`, full-document passes, workers, independent repeats, and
  abort thresholds;
- `g4dn.xlarge`, `g5.xlarge`, and `g6.xlarge` in that order.

The tracked profiles are under `infra/marker/profiles/`. LLM processing and image
descriptions are excluded. Decision runs reject Marker profiling; diagnostic
profiling must be run separately and cannot rank candidates.

One result cell is:

`candidate × instance × pass × workers × repeat`

A page counts only when conversion returns, Markdown and metadata exist, the
reported page count and page statistics match, and extracted image references
resolve safely. Invalid output and failed work remain in session cost but not in
the successful-page denominator.

## Private inputs

The fixed selection remains under ignored `docs/internal/marker-benchmark/` with
mode `0600`. It may contain object locations; never copy it into tracked files,
logs, or the metrics bundle.

Re-sign the existing selection:

```bash
umask 077
npm run benchmark:marker:urls -- \
  --env /home/semyon/jenkins/env/oghma-prod.env \
  --from-selection docs/internal/marker-benchmark/corpus-selection.json \
  --expires 7200 > /tmp/oghma-marker-urls.txt
```

Re-signing now checks the saved object size and modification metadata. The URL
file is a temporary secret. Transfer it without printing it and delete both
copies immediately after download.

On the first trusted staging host, create the private hash/page attestation:

```bash
npm run benchmark:marker -- attest-corpus \
  /workspace/corpus \
  /workspace/private/corpus-attestation.json
```

Privately add document-class labels before the decision run. At minimum review
coverage for born-digital, scanned, mixed, table-heavy, equation-heavy,
image-heavy, and poor-text-layer files. Later instances must use the saved
attestation while downloading:

```bash
npm run benchmark:marker:download -- \
  /workspace/urls.txt \
  /workspace/corpus \
  /workspace/results/<run-label>/downloads.jsonl \
  /workspace/private/corpus-attestation.json
rm -f /workspace/urls.txt
```

The runner verifies every ordinal, byte count, SHA-256, and page count before it
loads models.

## Operator configuration

Create ignored `docs/internal/marker-benchmark/operator-config.json`, set mode
`0600`, and fill it with the SSH aliases/paths plus the private lifecycle values:

```json
{
  "awsSshHost": "ssh-over-ssm-alias",
  "awsRepoPath": "/workspace/oghmanotes",
  "homelabSshHost": "homelab-alias",
  "homelabDestination": "/private/marker-benchmark-runs",
  "localRelay": "/tmp/oghma-marker-relay",
  "awsProfile": "operator-profile",
  "expectedAccount": "000000000000",
  "allowRootOperator": false,
  "runTag": "private-unique-run-tag",
  "schedulerRoleArn": "arn:aws:iam::000000000000:role/marker-deadline-scheduler",
  "deadlineUtc": "2026-07-16T23:00:00Z",
  "approvedHourlyRateUsd": 0.75,
  "maximumHourlyRateUsd": 1.00,
  "approvedHarnessSha256": "replace-with-64-hex-digest",
  "approvedCleanBuildSha256": "replace-with-64-hex-digest",
  "approvedDiagnosticBuildSha256": "replace-with-64-hex-digest",
  "harnessManifestPath": "/private/control/path/marker-harness.tar.gz.manifest.json",
  "cleanBuildManifestPath": "/private/control/path/marker-plus-plus-clean.manifest.json",
  "diagnosticBuildManifestPath": "/private/control/path/marker-plus-plus-diagnostic.manifest.json",
  "amiId": "approved-private-ami-id",
  "subnetId": "private-subnet-id",
  "securityGroupId": "no-ingress-security-group-id",
  "instanceProfileArn": "approved-ssm-instance-profile-arn",
  "rootDeviceName": "/dev/sda1",
  "volumeGiB": 75
}
```

The homelab destination retains both the metrics and restricted quality bundles
until they are manually deleted. Source PDFs are not bundled.

## Before launch

Use a non-root IAM operator and run:

```bash
npm run benchmark:marker:aws -- \
  --config docs/internal/marker-benchmark/operator-config.json preflight \
  --region eu-west-1 \
  --instance-type g4dn.xlarge
```

Preflight must report healthy identity, quota, offering, and zero active
benchmark or candidate GPU instances. Also record the current On-Demand rate,
approved absolute deadline, transfer buffer, and maximum spend.

Preview the exact launch request, then explicitly execute it:

```bash
npm run benchmark:marker:aws -- \
  --config docs/internal/marker-benchmark/operator-config.json launch \
  --region eu-west-1 --instance-type g4dn.xlarge

npm run benchmark:marker:aws -- \
  --config docs/internal/marker-benchmark/operator-config.json launch \
  --region eu-west-1 --instance-type g4dn.xlarge --execute
```

The guarded launch creates exactly one instance with:

- On-Demand `g4dn.xlarge` in `eu-west-1`;
- the approved AWS Nvidia/PyTorch base AMI;
- no public IP and no ingress rules;
- SSM instance profile and IMDSv2 required;
- encrypted 75 GiB gp3 with delete-on-termination;
- instance-initiated shutdown behavior `terminate`;
- `Project=oghma-marker-benchmark` and the unique private `BenchmarkRun` tag.

After SSH-over-SSM is available, arm the guest deadline:

```bash
sudo bash infra/marker/benchmark-userdata.sh <absolute-utc-deadline>
systemctl status oghma-marker-deadline.timer --no-pager
```

Then verify the AWS-side state from the control host:

```bash
npm run benchmark:marker:aws -- \
  --config docs/internal/marker-benchmark/operator-config.json postlaunch \
  <instance-id> \
  --region eu-west-1 \
  --instance-type g4dn.xlarge

npm run benchmark:marker:aws -- \
  --config docs/internal/marker-benchmark/operator-config.json arm-deadline \
  <instance-id> --region eu-west-1 --execute
```

Do not transfer signed URLs or source files until every post-launch check passes.
The persistent guest timer and verified EventBridge Scheduler action are
independent absolute backstops. The operator may still terminate earlier.

## Prepare the implementation

Package Marker++ from its exact committed tree:

```bash
scripts/package-marker-plus-plus.sh \
  /tmp/marker-plus-plus-2d66e45c0a1f8a3c081c6c96f47e1f7b6af2b03a.tar.gz

MARKER_PLUS_PLUS_REPO=/home/semyon/code/personal/marker-debug \
MARKER_PLUS_PLUS_COMMIT=e47790de55b8279c9e10a47c29d30fa9911b5299 \
scripts/package-marker-plus-plus.sh /tmp/marker-plus-plus-diagnostic-e47790d.tar.gz

python3 scripts/marker-bench.py package-harness /tmp/oghma-marker-harness.tar.gz
```

Transfer only the archive, checksum, manifest, benchmark scripts, profiles, and
temporary URL file. Never transfer Jenkins environment files or storage keys.

On the instance, verify both packages, create isolated clean/diagnostic
environments over the approved CUDA base, and prefetch the shared models:

```bash
bash scripts/marker-bench-prepare-instance.sh \
  /workspace/builds/marker-plus-plus-clean.tar.gz \
  /workspace/builds/marker-plus-plus-diagnostic.tar.gz \
  /workspace/marker-runtime
```

Use `/workspace/marker-runtime/venvs/clean/bin/python` for the ranking pass and
`/workspace/marker-runtime/venvs/diagnostic/bin/python` for the diagnostic pass.
The preparation command fails if CUDA or either package identity is invalid and
records installed packages plus GPU/driver identity. Do not update packages or
models between passes.

## Run and monitor

Use a safe lowercase run label. The deadline must leave at least 15 minutes for
bundle creation and transfer.

Clean pinned Marker++ performance pass:

```bash
mkdir -p /workspace/results/<run-label>/decision/marker-plus-plus-conservative
set -o pipefail
MARKER_BENCH_PYTHON=/workspace/marker-runtime/venvs/clean/bin/python \
npm run benchmark:marker -- run \
  /workspace/corpus \
  /workspace/private/corpus-attestation.json \
  /workspace/results \
  --candidate marker-plus-plus-conservative \
  --source-revision 2d66e45c0a1f8a3c081c6c96f47e1f7b6af2b03a \
  --build-manifest /workspace/builds/marker-plus-plus-clean.manifest.json \
  --run-label <run-label> \
  --instance-type g4dn.xlarge \
  --region eu-west-1 \
  --hourly-rate-usd <current-rate> \
  --deadline-utc <absolute-utc-deadline> \
  --harness-manifest /workspace/builds/oghma-marker-harness.tar.gz.manifest.json \
  --approved-harness-sha256 <approved-harness-sha256> \
  2>&1 | tee /workspace/results/<run-label>/decision/marker-plus-plus-conservative/runner.log
```

Use separate installed environments and result roots. Do not point two
implementations at the same candidate directory.

After the unprofiled Marker++ pass, run its separately labelled resource
diagnostic. It is forced to one worker and one repeat per preview/full pass,
samples resources every 250 ms, records Marker++ stage events, and captures
private page/layout overlays plus block JSON:

```bash
MARKER_BENCH_PYTHON=/workspace/marker-runtime/venvs/diagnostic/bin/python \
npm run benchmark:marker:diagnostic -- \
  /workspace/corpus \
  /workspace/private/corpus-attestation.json \
  /workspace/results \
  --candidate marker-plus-plus-conservative \
  --source-revision e47790de55b8279c9e10a47c29d30fa9911b5299 \
  --build-manifest /workspace/builds/marker-plus-plus-diagnostic.manifest.json \
  --run-label <run-label> \
  --instance-type g4dn.xlarge \
  --region eu-west-1 \
  --hourly-rate-usd <current-rate> \
  --deadline-utc <absolute-utc-deadline> \
  --harness-manifest /workspace/builds/oghma-marker-harness.tar.gz.manifest.json \
  --approved-harness-sha256 <approved-harness-sha256>
```

Diagnostic outputs have `rankingEligible=false`. Marker++ stages mix CPU and
asynchronous GPU work, so their timings are host-observed wall time rather than
CPU-only/GPU-only attribution. Analyse `resourceOverlap`, raw telemetry,
source-page overlays, layout overlays, block JSON, final Markdown, metadata,
and extracted images together after transfer to the homelab.

The diagnostic source is the dedicated
`debug/oghma-resource-benchmark` worktree commit above. Package it separately:

```bash
MARKER_PLUS_PLUS_REPO=/home/semyon/code/personal/marker-debug \
MARKER_PLUS_PLUS_COMMIT=e47790de55b8279c9e10a47c29d30fa9911b5299 \
scripts/package-marker-plus-plus.sh /tmp/marker-plus-plus-diagnostic.tar.gz
```

From a second SSH-over-SSM session, watch the runner, GPU, deadline, and newest
telemetry stream:

```bash
tail -F /workspace/results/<run-label>/<mode>/<candidate>/runner.log
nvidia-smi dmon -s pucvmet -d 1
systemctl list-timers oghma-marker-deadline.timer --no-pager
```

The runner writes each document record immediately. It stops a cell on the fixed
failure, CUDA OOM, system OOM, no-progress timeout, idle-GPU, or transfer-buffer
gate and records why later cells were skipped. Do not override an abort during a
paid run; inspect the evidence from the server copy first.

## Collection and termination

Do not review outputs on AWS. After the selected runs finish, collect from the
control host:

```bash
bash scripts/marker-bench-collect.sh \
  docs/internal/marker-benchmark/operator-config.json \
  <instance-id> \
  eu-west-1 \
  /workspace/results/<run-label> \
  <run-label>
```

The collector:

1. creates a redacted metrics bundle and restricted quality bundle on AWS;
2. verifies both on the local relay;
3. transfers both to a private homelab staging directory;
4. verifies archive safety, inner manifests, and checksums on the homelab;
5. atomically promotes the run and returns matching receipts;
6. deletes the AWS result/corpus tree best-effort;
7. terminates the exactly tagged instance;
8. removes the local relay copy.

Normal termination is refused until both homelab receipts verify. A collection
failure leaves time for a retry, but both absolute deadline mechanisms remain
authoritative and may terminate the instance even if results are lost.

Audit immediately afterward:

```bash
npm run benchmark:marker:aws -- \
  --config docs/internal/marker-benchmark/operator-config.json audit
```

The audit must return healthy with no active instance, EBS volume, address, ENI,
security group, AMI, or snapshot for the run.

## Review and promotion

Review released Marker versus Marker++ conservative from the homelab. Use
`compare-marker-outputs.py` for structural flags, then inspect every flagged file
and a fixed random subset against private source-page references. Pay particular
attention to OCR routing, equations, tables, reading order, and images.

Only after that review may the fast profile, next worker count, next GPU, CPU
economics pass, HTTP concurrency, dev import, or AMI bake be approved. A faster
GPU is not a reason to continue unless it can answer a remaining cost, latency,
VRAM, or quality question.

## Qwen3.5 vision phase (prepared, not launched)

The Ollama vision cells are retired and cannot count as enhanced evidence.
Marker++ now uses the repository-owned `OpenAICompatibleVisionService`, packaged
as `marker.services.openai_compatible_vision`, with the
loopback-only OpenAI-compatible endpoint `http://127.0.0.1:8000/v1`. The initial
model is Qwen3.5-4B BF16. Its engine, software, 16K context, two-image limit and
safe command are pinned in
[`qwen3.5-4b-vllm-manifest.json`](../../infra/marker/qwen3.5-4b-vllm-manifest.json).
Qwen3.5-9B BF16 remains a separately pinned, disabled challenger and requires
later approval.
The harness rejects model, vLLM, Torch, CUDA, thinking, or manifest drift. Model
weights remain in a private AMI/cache, never Git or result archives.

Before any private PDF, run:

```bash
PYTHONDONTWRITEBYTECODE=1 uv run \
  --with 'pydantic>=2,<3' --with pillow \
  python -m unittest scripts.tests.test_openai_compatible_vision -v
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest \
  scripts.tests.test_marker_benchmark \
  scripts.tests.test_marker_benchmark_ops -v
```

These cover text-only, one/multiple images, equation/table/complex schemas,
invalid JSON/schema, HTTP 400/429/500, disconnect, identity mismatch, bounded
retry, zero-call invalidation, preview/full isolation, redaction and archive
safety. A local server smoke must also return one schema-validated result before
the corpus gate opens.

Use sequential A10G operation: run Marker, release its model artifacts and check
VRAM, start the pinned Qwen/vLLM command, then process selected figures/pages.
Do not assume Marker/2 and Qwen fit concurrently in 23 GB. L40S 48 GB is the
later optional concurrent test. The Qwen3.5-4B candidate uses one worker, preview
pages 0–2 and one repeat; full documents run only after every preview is healthy.
Thinking is disabled. A thinking diagnostic requires its own profile/manifest
identity. The fixed 24-PDF corpus is the maximum scope; never run the vault.

A document is invalid on terminal LLM failure, malformed structured output,
wrong model, zero successful calls, or accounting/metadata disagreement. Safe
records contain only counts, tokens, latency, model, endpoint type,
response-schema-derived processor type and error category—never prompts,
images, filenames or raw responses. Finalisation creates
independently verified `metrics`, `quality` comparison, and private `restricted`
output archives. Source PDFs, private names/keys, signed URLs, accounts,
credentials, prompts and raw responses are forbidden.
