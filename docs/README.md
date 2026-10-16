# Documentation

> **Status:** Current navigation map
> **Last reviewed:** 2026-10-16
> **Source of truth for:** Which document owns each kind of project information

Use this page to find the owner of a fact. Link to that owner instead of copying its content into another checklist or handover. Every file under `docs/` is listed once below, apart from the `history/` archive, which has [its own index](history/README.md).

Status means:

- **Current:** describes the running code or process. Maintain it with that code.
- **Target:** an intended direction, plan or contingency. It is not proof of deployment.
- **History:** context only. Don't run commands from it without rebuilding a current runbook.

## Start by task

| I need to… | Use |
|---|---|
| Understand the product | [Project README](../README.md) |
| Run the app locally | [Local setup](../SETUP.md) |
| Find current work | [Current-work pointers](../TODO.md) |
| Find the code, routes and data for a feature | [Domains](engineering/domains.md) |
| Understand the running system | [Architecture](engineering/architecture.md) |
| Operate the current deployment | [Infrastructure index](../infra/README.md) and [homelab runbook](../infra/HOMELAB.md) |
| Operate import and vault workers | [Import-worker runbook](operations/import-worker.md) |
| Rebuild the vector index | [Vector index rebuild](operations/vector-index.md) |
| Build or distribute the Android alpha | [Android alpha](engineering/mobile-alpha.md) |
| Prepare a beta or paid launch | [Launch checklist](product/launch-checklist.md) |
| See what the last audit found and what is still open | [October 2026 domain audit](history/2026-10-06-domain-audit.md) |

## Engineering

| Document | Status | Owns |
|---|---|---|
| [Architecture](engineering/architecture.md) | Current | App, data, queue, worker and deployment boundaries; route conventions |
| [Domains](engineering/domains.md) | Current | Per-domain entry points, flows, data, external services and folders |
| [Import pipeline](engineering/import-pipeline.md) | Current | Canvas, upload and vault processing stages and tuning model |
| [Canvas reliability handover](engineering/canvas-import-queue-reliability-handover.md) | Current, rollout gates open | Execution ownership, shared PDF reuse, replacement and Stop contracts, claim-recovery release gates |
| [File-tree coordination](engineering/file-tree-coordination.md) | Current | Tree request ordering, refresh, restore placement, session resets and import publication |
| [Markdown rendering](engineering/markdown-rendering.md) | Current | Canonical Markdown, editor, renderer, highlighting and sanitisation contract |
| [Split-pane editor](engineering/split-pane-editor.md) | Current | Pane drag and swap, save affordance, load failures, the second-editor cost |
| [Study maps](engineering/study-map.md) | Current | Topic catalogues, evidence, classification, the course map and exam analysis |
| [Exam papers](engineering/exam-papers.md) | Current | Galway archive scanning, local extraction and importing past papers into module maps |
| [Android alpha](engineering/mobile-alpha.md) | Current | Android shell, native sign-in, offline reader, updates and release state |
| [Agent compatibility](engineering/agent-compatibility.md) | Current | Public discovery and action surfaces, OpenAPI safety flags, agent-safety gaps |
| [Anonymous usage counts](engineering/anonymous-telemetry.md) | Current | Telemetry contract and the operational-logging boundary |
| [Design system](engineering/design-system.md) | Current | UI tokens and component conventions |
| [Testing](engineering/testing.md) | Current | Suite scopes, fast checks, disposable-service verification and CI scope |
| [Database performance and integrity](engineering/database-performance.md) | Current, production measurements pending | Database fixes, the migration runner, synthetic measurements and rollout checks |
| [Performance](engineering/performance.md) | Current | Repeatable performance-audit workflow and evidence rules |
| [Demo flow](engineering/demo-flow.md) | Current | Product walkthrough without duplicating architecture |
| [Canvas data emergency plan](engineering/canvas-data-emergency-plan.md) | Target (contingency, not built) | Options for reducing or stopping retention of Canvas content |

## Operations

| Document | Status | Owns |
|---|---|---|
| [Infrastructure index](../infra/README.md) | Current | Owner map for current, target, retained and historical infrastructure |
| [Import worker](operations/import-worker.md) | Current | Worker deployment, healthcheck, tuning, vault recovery and claim-recovery rollout |
| [Chat](operations/chat.md) | Current | Chat queue, delivery, cancellation, readiness, diagnosis and release checks |
| [Error and performance monitoring](operations/monitoring.md) | Current (off until a DSN is configured) | Sentry configuration, privacy filters, verification and rollout requirements |
| [Vector index rebuild](operations/vector-index.md) | Current | Rebuilding Qdrant from PostgreSQL after data loss or a model change |
| [Security rollout](operations/security-rollout.md) | Current | Session revocation, vault retention and Android association gates |
| [Email](operations/email.md) | Current | Human inbox ownership and transactional-email setup |
| [Secrets](operations/secrets.md) | Current | Secret ownership, rotation and recovery policy |
| [RunPod Serverless Marker](operations/runpod-marker.md) | Target (endpoint deployed; its 2026-08-05 status says paid dispatch is off) | Async GPU endpoint, image, webhook rules, launch gates and rollback |
| [Vast Serverless Marker](operations/vast-marker.md) | Target (not live) | GPU queue boundary, image, scaling, failure classification, launch gates and rollback |
| [Marker++ hosted vision](operations/marker-hosted-vision.md) | Target | Hosted-vision benchmark profile and its adapter |
| Marker++ [benchmark index](https://github.com/semyonfox/marker-plus-plus/blob/main/docs/benchmarks/README.md) (separate repository) | Current | Canonical Marker and Marker++ GPU measurements and the serving decision |
| [`security/SECRETS.md`](security/SECRETS.md) | History (pointer) | Superseded local secret notes; points to the secrets policy |

## Product and launch

| Document | Status | Owns |
|---|---|---|
| [Roadmap](product/roadmap.md) | Target | Product outcomes, phases and sequencing |
| [Launch checklist](product/launch-checklist.md) | Current | Beta and paid-launch gates |
| [Positioning](product/positioning.md) | Current | Public promise, message hierarchy and claim boundaries |
| [Pricing](product/pricing.md) | Target | Price ranges, entitlements, allowances and cost triggers |
| [Company admin](product/company-admin.md) | Target | Company and payment administration sequence; not professional advice |

## Decisions and research

Dated evidence. Recheck volatile provider facts before acting.

| Document | Status | Use |
|---|---|---|
| [Payment processor decision](decisions/2026-06-11-payment-processor.md) | Current decision | Accepted Stripe Managed Payments ADR and reopen conditions |
| [Canvas import cost study](research/2026-06-14-canvas-import-costs.md) | History (dated research) | Aggregate workload and cost-model inputs |
| [`SRS.tex`](SRS.tex) / [`SRS.pdf`](SRS.pdf) | History | University requirements artefact from the AWS-hosted phase. It still describes 1-hour presigned file URLs and ElastiCache rate limiting, neither of which is current |

## History

The [history index](history/README.md) lists completed handovers, audits, retired designs and university artefacts, including the [October 2026 domain audit](history/2026-10-06-domain-audit.md) and the [architecture history](history/2026-10-06-architecture-history.md).

## Component documentation

Feature-local maps cover [notes](../src/lib/notes/README.md), [chat](../src/lib/chat/README.md), the [Canvas import and worker path](../src/lib/canvas/README.md) and the [Android app](../apps/mobile/README.md). Use the architecture and operations documents above for cross-cutting or runtime changes.

The vendored Canvas MCP has its own [README](../src/lib/canvas-mcp/README.md), [tool manifest](../src/lib/canvas-mcp/TOOL_MANIFEST.md), [contributor guide](../src/lib/canvas-mcp/CONTRIBUTING.md), [attribution record](../src/lib/canvas-mcp/ATTRIBUTION.md) and [license](../src/lib/canvas-mcp/LICENSE). Its standalone 126-tool surface is not the same as the 83-tool profile OghmaNotes hosts.

## Precedence and upkeep

When documents disagree, prefer the implementation and configuration, then the current owner listed above. A migration file proves that a migration exists, not that it ran in a particular environment.

Don't rewrite licenses, attribution records, dependency manifests, generated PDFs or Markdown fixtures for style. Keep private material in the ignored `docs/internal/` directory and out of commits.

Update `Last reviewed` only after substantively rechecking a document's claims, not for a formatting-only edit. When a handover or plan is finished, move it to `docs/history/` with a dated filename and add it to the history index. Root and `infra/` entry points keep their uppercase names; files in `docs/` topic directories use lowercase kebab-case.
