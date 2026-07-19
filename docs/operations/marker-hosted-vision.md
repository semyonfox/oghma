# Marker++ hosted vision

> **Status:** implementation runbook
> **Last reviewed:** 2026-07-18

The hosted Marker++ profile uses the repository-owned fail-closed adapter. It
does not start vLLM or SGLang and does not download model weights. Provider
credentials are read from the process environment and are never written to a
profile, manifest, accounting record, or result bundle.

Select the provider and model with one variable:

```shell
export MARKER_VISION_TARGET='openrouter-siliconflow:qwen/qwen3.5-9b'
export OPENROUTER_API_KEY='...'
```

Supported target forms are:

```text
openrouter:<OpenRouter model ID>
openrouter-siliconflow:<OpenRouter model ID>
siliconflow:<SiliconFlow model ID>
```

`openrouter-siliconflow` pins OpenRouter routing to SiliconFlow, disables
provider fallback, and requests no provider data collection. `openrouter`
allows OpenRouter to choose the endpoint. `siliconflow` calls SiliconFlow
directly and reads `SILICONFLOW_API_KEY`. Model IDs use the provider's exact
wire identifier; the response must return the same identifier or the document
is invalidated.

The checked-in hosted profile defaults to Qwen3.5-9B through OpenRouter routed
to SiliconFlow. `MARKER_VISION_TARGET` overrides that default. Thinking remains
disabled unless the profile explicitly enables it.

Do not put API keys in JSON profiles, shell history, benchmark artifacts, or
command-line arguments. Do not use private PDFs until fake-server tests and a
separately approved paid synthetic smoke test pass. Hosted benchmark runs still
require the benchmark harness LLM approval flag and preview health gate.

## Measured concurrency result

On 2026-07-18, the same three-note, nine-page T4 preview was run with two
Marker workers and Qwen3.5-9B through OpenRouter pinned to SiliconFlow.
Thinking was disabled. Raising `max_concurrency` from one to ten did not reduce
the number of calls and did not improve speed:

| Measure | Concurrency 1 | Concurrency 10 |
| --- | ---: | ---: |
| Completed pages | 9/9 | 6/9 |
| Wall time | 108.721s | 469.062s |
| Pages/s | 0.082781 | 0.012791 |
| Successful calls recorded | 25 | 15 |
| Outcome | valid | invalid: `gpu_idle_while_queued` |

Concurrency ten was 84.55% slower by successful-page throughput and aborted
before the third document completed. Independent calls can overlap, but the
provider latency under this burst outweighed any saved serialization. Keep
concurrency one for this route. Reduce unnecessary descriptions/corrections
before testing a separately bounded concurrency of two or three.

The lower recorded call count does not mean concurrency avoided requests.
Request accounting is finalized per completed document; the unfinished
document has no final request record. Therefore `summary.json`, not a count of
`requests.jsonl` rows, determines whether a cell completed. A missing document
record in an aborted cell means unknown partial activity, never zero activity.

Stage checkpoints cover processor boundaries, structured request type,
latency, resource telemetry, and final Markdown. They do not preserve
intermediate Markdown after every LLM processor, so they can locate slow
stages but cannot assign an exact visual improvement to each call.

## Raw evidence and interpretation

The local evidence root is:

```text
/home/semyon/marker-benchmark-runs/marker-t4-c10-20260718-0103/
```

- `...-metrics.tar.gz` is the redacted operational bundle. Start with
  `summary.json`; use `requests.jsonl` for completed-document accounting,
  `telemetry.jsonl` for sampled CPU/GPU data, and `run-manifest.json` for the
  safe configuration identity.
- `...-quality.tar.gz` contains the safe comparison material produced before
  abort.
- `...-restricted.tar.gz` contains Markdown, images, metadata, and private
  corpus attestations. It remains on the homelab and must not be published or
  unpacked into the review site's served directory.
- Adjacent `.sha256` files and local/homelab receipts prove archive integrity
  and preservation; they do not make restricted content shareable.

The instance and temporary AWS networking were deleted after collection. The
run-tag audit reported zero remaining instances, volumes, interfaces,
addresses, security groups, images, snapshots, or schedules.
