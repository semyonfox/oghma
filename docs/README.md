# Documentation

> **Status:** Current navigation map
> **Last reviewed:** 2026-07-16
> **Source of truth for:** Which document owns each kind of project information

Use this page to find the owner of a fact. Link to that owner instead of copying its content into another checklist or handover.

## Start by task

| I need to… | Use |
|---|---|
| Understand the product | [Project README](../README.md) |
| Run the app locally | [Local setup](../SETUP.md) |
| Find current work | [Current-work pointers](../TODO.md) |
| Understand the running code | [Architecture](engineering/architecture.md) |
| Operate the current deployment | [Infrastructure index](../infra/README.md) and [homelab runbook](../infra/HOMELAB.md) |
| Operate import and vault workers | [Import-worker runbook](operations/import-worker.md) |
| Prepare a beta or paid launch | [Launch checklist](product/launch-checklist.md) |
| Change product sequence | [Roadmap](product/roadmap.md) |
| Change pricing or allowances | [Pricing plan](product/pricing.md) |
| Work on public agent surfaces | [Agent compatibility](engineering/agent-compatibility.md) |

## Product and launch

| Document | Owns |
|---|---|
| [Roadmap](product/roadmap.md) | Product outcomes, phases, and sequencing |
| [Positioning](product/positioning.md) | Public promise, message hierarchy, and claim boundaries |
| [Pricing](product/pricing.md) | Price ranges, entitlements, allowances, and cost triggers |
| [Growth analytics](product/growth-analytics.md) | Funnel events, attribution, privacy limits, dashboard, and retention |
| [Launch checklist](product/launch-checklist.md) | Beta and paid-launch gates |
| [Company admin](product/company-admin.md) | Company/payment administrative sequence; not professional advice |

## Engineering

| Document | Owns |
|---|---|
| [Architecture](engineering/architecture.md) | Current application, data, queue, worker, and deployment boundaries |
| [Import pipeline](engineering/import-pipeline.md) | Canvas/vault processing stages and tuning model |
| [Design system](engineering/design-system.md) | UI tokens and component conventions |
| [Markdown rendering](engineering/markdown-rendering.md) | Canonical Markdown, editor, renderer, highlighting, and sanitisation contract |
| [Unified editor migration handover](engineering/markdown-editor-migration-handover.md) | Target Milkdown spike, implementation criteria, T3 Code visual reference, release gates, and research sources |
| [Performance](engineering/performance.md) | Repeatable performance-audit workflow and evidence rules |
| [Demo flow](engineering/demo-flow.md) | Product walkthrough without duplicating architecture |
| [Agent compatibility](engineering/agent-compatibility.md) | Verified discovery/action surfaces and agent-safety gaps |
| [Architecture history](engineering/architecture-history.md) | Short infrastructure evolution record; not current operations |

## Operations

| Document | Owns |
|---|---|
| [Infrastructure index](../infra/README.md) | The owner map for current, target, retained, and historical infrastructure |
| [Import worker](operations/import-worker.md) | Worker deployment, verification, tuning, and recovery |
| Marker++ benchmark analysis (separate repository: `/home/semyon/code/personal/marker++/docs/benchmarks/`) | Canonical Marker/Marker++ GPU measurements, analysis, evidence boundaries, and serving decision |
| [Email](operations/email.md) | Human inbox ownership and transactional-email setup |
| [Secrets](operations/secrets.md) | Safe secret ownership, rotation, and recovery policy |

## Decisions and research

These files are dated evidence. Recheck volatile provider facts before acting.

| Document | Use |
|---|---|
| [Payment processor decision](decisions/2026-06-11-payment-processor.md) | Accepted Stripe Managed Payments ADR and reopen conditions |
| [Canvas import cost study](research/2026-06-14-canvas-import-costs.md) | Aggregate workload and dated cost-model inputs |

## History

[Historical records](history/README.md) explain completed implementation sessions, handovers, university artifacts, and retired deployment details. They provide provenance, not current instructions.

## Component documentation

The vendored Canvas MCP has its own [README](../src/lib/canvas-mcp/README.md), [tool manifest](../src/lib/canvas-mcp/TOOL_MANIFEST.md), [contributor guide](../src/lib/canvas-mcp/CONTRIBUTING.md), [attribution record](../src/lib/canvas-mcp/ATTRIBUTION.md), and [license](../src/lib/canvas-mcp/LICENSE). Its standalone 129-tool surface is not the same as the filtered Canvas tool surface hosted by OghmaNotes.

## Status and precedence

- **Active reference:** Maintain with the code or process it describes.
- **Working-tree reference:** Describes preserved local work that is not yet
  proof of a commit or deployment; resolve its status before release.
- **Target or decision:** Records an intended direction; it is not proof of deployment.
- **Dated research:** Preserves inputs and limitations; it is not a live price sheet.
- **Historical:** Context only. Do not execute commands from it without rebuilding a current runbook.

When documents disagree, prefer the relevant implementation/configuration and the active owner listed above. A migration file proves that a migration exists, not that it ran in a particular environment.

Do not rewrite licenses, attribution records, dependency manifests, generated PDFs, or Markdown fixtures for style. Keep private material in the ignored `docs/internal/` directory and out of commits.

Update `Last reviewed` only after substantively rechecking the document's
claims, not for a formatting-only edit. Root and `infra/` entry points retain
their established uppercase names; files in `docs/` topic directories use
lowercase kebab-case.
