# Unified Design System Spec

Status: historical design record. The current canonical design system is [../../design-system.md](../../design-system.md).

## Intent

Unify app pages around the landing page's calm glass/surface aesthetic while keeping study content readable and focused.

## Decisions Retained In The Canonical Design Doc

- Use semantic Tailwind tokens for spacing, radius, typography, surfaces, and containers.
- Keep app pages calm and content-first.
- Use `bg-app-page`, `bg-surface`, `.glass-panel`, and `.glass-card*` consistently.
- Reserve serif type for page-level titles.
- Avoid arbitrary text sizes and one-off surface colors in new code.
- Keep file tree styling frozen unless deliberately redesigned.

## Canonical References

- `tailwind.config.js`
- `src/app/globals.css`
- `src/app/page.js`
- `docs/design-system.md`

## Verification

- New UI follows `docs/design-system.md`.
- Shared tokens are used instead of local one-off classes.
- Page shells remain readable in light and dark themes.
