# Documentation Index

This index is the map of canonical docs. Historical plans are kept for context, but current operations should link back here.

## Start Here

| Doc | Use |
|---|---|
| [../README.md](../README.md) | Product overview, stack, and top-level links |
| [../SETUP.md](../SETUP.md) | Local setup, env groups, commands, deploy flow |
| [../TODO.md](../TODO.md) | Short current-work handoff |

## Operations And Provider Plan

| Doc | Use |
|---|---|
| [../infra/HOMELAB.md](../infra/HOMELAB.md) | Current production/dev stack, containers, queues, Jenkins flow |
| [../infra/AWS_INFRASTRUCTURE.md](../infra/AWS_INFRASTRUCTURE.md) | AWS archive/fallback reference and any explicitly retained services |
| [../infra/MIGRATION_RUNBOOK.md](../infra/MIGRATION_RUNBOOK.md) | Historical AWS-to-homelab migration record |
| [../infra/TARGET_HOSTING.md](../infra/TARGET_HOSTING.md) | Go-forward launch hosting target: Cloudflare, Neon, R2, Node worker/runtime, on-demand GPUs |
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | Current Canvas/vault worker deploy and tuning notes |
| [EMAIL_SETUP.md](EMAIL_SETUP.md) | Company inbox, alias, Cloudflare, and transactional email setup |

## Product And Launch

| Doc | Use |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Product phases and feature priorities |
| [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) | Launch blockers, security, compliance, QA, monitoring |
| [LANDING_PAGE_PIVOT.md](LANDING_PAGE_PIVOT.md) | Canvas-first landing page positioning, CTAs, pricing framing, and NotebookLM comparison |
| [GROWTH_FUNNEL.md](GROWTH_FUNNEL.md) | Landing-page funnel events, UTM policy, analytics privacy decisions, and GEO monitoring |
| [HANDOVER_2026-07-07_AGENTIC_GEO_FUNNEL.md](HANDOVER_2026-07-07_AGENTIC_GEO_FUNNEL.md) | Current handover for agentic GEO routes, lead-capture scaffolding, missing analytics, and deploy checks |
| [PRICING.md](PRICING.md) | Pricing tiers, cost model, infrastructure upgrade triggers |
| [CANVAS_IMPORT_PRICING_REPORT.md](CANVAS_IMPORT_PRICING_REPORT.md) | Source-of-truth Canvas import page volume, API-vs-GPU cost model, and allowance guidance |
| [PAYMENT_PROCESSOR_DECISION.md](PAYMENT_PROCESSOR_DECISION.md) | Stripe Managed Payments decision record |
| [COMPANY_FORMATION_AND_LAUNCH_ADMIN.md](COMPANY_FORMATION_AND_LAUNCH_ADMIN.md) | Irish LTD, founder, bank, Revenue, RBO, and paid-launch admin order |

## Engineering References

| Doc | Use |
|---|---|
| [design-system.md](design-system.md) | Current UI tokens and component conventions |
| [OPTIMIZATION_SUMMARY.md](OPTIMIZATION_SUMMARY.md) | Import pipeline optimization summary |
| [architecture-obsidian.md](architecture-obsidian.md) | Current homelab/code architecture atlas for Obsidian-style reference |
| [obsidian-demo-user-flow.md](obsidian-demo-user-flow.md) | Current architecture and demo flow |
| [SERVER_HANDOFF_chat_parts.md](SERVER_HANDOFF_chat_parts.md) | Chat message parts migration handoff |

## Historical Records

| Area | Use |
|---|---|
| [superpowers/](superpowers/) | Condensed implementation plans and specs from earlier build sessions |
| [project-report-merged-2026-03-30.md](project-report-merged-2026-03-30.md) | Historical project report for review/scrutiny, not current architecture truth |
| `SRS.tex` / `SRS.pdf` | Archived formal requirements artifact from the university project phase; not launch architecture truth |

When docs disagree, prefer current code and the current operations docs above historical reports or implementation plans. For launch provider choices, use [../infra/TARGET_HOSTING.md](../infra/TARGET_HOSTING.md); for Canvas import limits/costs, use [CANVAS_IMPORT_PRICING_REPORT.md](CANVAS_IMPORT_PRICING_REPORT.md); for company/admin sequencing, use [COMPANY_FORMATION_AND_LAUNCH_ADMIN.md](COMPANY_FORMATION_AND_LAUNCH_ADMIN.md).
