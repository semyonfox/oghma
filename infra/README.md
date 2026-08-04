# Infrastructure Documentation

> Status: Active navigation
>
> Audience: Maintainers and deployment operators
>
> Last reviewed: 2026-07-25

Infrastructure documents have one responsibility each:

| Document | Boundary |
|---|---|
| [HOMELAB.md](HOMELAB.md) | Current verified production/development runtime and Jenkins deployment |
| [TARGET_HOSTING.md](TARGET_HOSTING.md) | Future hosting architecture decision; not live operations |
| [AWS_INFRASTRUCTURE.md](AWS_INFRASTRUCTURE.md) | Retained or fallback AWS surface only |
| [MIGRATION_RECORD.md](MIGRATION_RECORD.md) | Completed AWS-to-homelab migration record |
| [Import worker runbook](../docs/operations/import-worker.md) | Canvas, extraction, retry, and vault workload operations |
| [Marker infrastructure boundary](marker/README.md) | Current benchmark tooling versus retired AWS provisioning scripts and package pins |
| [Vast Marker image](vast-marker/README.md) | Build-ready, undeployed Vast PyWorker image and capacity profiles |
| [Vast Marker operations](../docs/operations/vast-marker.md) | Provider boundary, scale-to-zero plan, funding-time launch gates, monitoring, and rollback |
| [Email operations](../docs/operations/email.md) | Human inbox and transactional-email ownership |
| [Secrets policy](../docs/operations/secrets.md) | Safe repository boundary for runtime credentials |

When documents disagree, use current code and `Jenkinsfile`, then
`HOMELAB.md`. `TARGET_HOSTING.md` describes intent only. Historical records
must never supply live deployment commands.

Hardware, SSH, LAN, and personal-device inventory does not belong in this
repository. Keep it in the private device-fleet inventory.
