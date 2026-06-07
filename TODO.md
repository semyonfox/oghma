# Current Work Tracker

This file is intentionally short. Detailed, canonical tracking lives in:

- [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) for launch blockers and manual QA
- [docs/ROADMAP.md](docs/ROADMAP.md) for product phases and feature sequencing
- [docs/PRICING.md](docs/PRICING.md) for cost, tier, and infrastructure economics

## Immediate Launch Blockers

- Verify a real production Canvas import from PDF to extraction, embedding, and search/chat retrieval.
- Move SES out of sandbox so transactional emails work for unverified recipients.
- Rotate any dev/default secrets in the homelab Jenkins env files.
- Review `/privacy` and `/terms` wording before inviting real users.
- Add basic uptime, disk, database, and container health monitoring.
- Make OCR/indexing cold-start UX explicit instead of leaving long silent waits.

## Near-Term Product Work

- Improve onboarding for empty workspaces and first Canvas connection.
- Add recent graded-assignment feedback to the dashboard.
- Add assignment type icons and better task scanning.
- Finish Stripe Managed Payments only when the app is ready to charge.
- Keep Premium/annual pricing disabled until usage limits and demand are proven.

## Maintenance Notes

- Use `npm` only.
- Keep deploy flow as `dev` -> PR -> `main`.
- Treat `docs/superpowers/` as historical implementation records, not current operational runbooks.
