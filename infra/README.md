# Infrastructure Documentation

> Status: Active navigation
>
> Audience: Maintainers and deployment operators
>
> Last reviewed: 2026-07-11

Infrastructure documents have one responsibility each:

| Document | Boundary |
|---|---|
| [HOMELAB.md](HOMELAB.md) | Current verified production/development runtime and Jenkins deployment |
| [TARGET_HOSTING.md](TARGET_HOSTING.md) | Future hosting architecture decision; not live operations |
| [AWS_INFRASTRUCTURE.md](AWS_INFRASTRUCTURE.md) | Retained or fallback AWS surface only |
| [MIGRATION_RECORD.md](MIGRATION_RECORD.md) | Completed AWS-to-homelab migration record |
| [Import worker runbook](../docs/operations/import-worker.md) | Canvas, extraction, retry, and vault workload operations |
| [Email operations](../docs/operations/email.md) | Human inbox and transactional-email ownership |
| [Secrets policy](../docs/operations/secrets.md) | Safe repository boundary for runtime credentials |

When documents disagree, use current code and `Jenkinsfile`, then
`HOMELAB.md`. `TARGET_HOSTING.md` describes intent only. Historical records
must never supply live deployment commands.

Hardware, SSH, LAN, and personal-device inventory does not belong in this
repository. Keep it in the private device-fleet inventory.
