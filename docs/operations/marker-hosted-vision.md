# Marker++ hosted vision

> **Status:** implementation runbook
> **Last reviewed:** 2026-07-17

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
