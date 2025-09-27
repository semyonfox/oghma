# Project Notes: Next.js Full‑Stack Overview

Next.js in this repo handles both frontend (pages/components) and backend (API routes) in one codebase.

- Frontend routes live under `src/app/**/page.js`
- API routes (server-only) live under `src/app/api/**/route.js`
- Shared utilities live in `src/lib/`
- Database-related code/config lives in `src/database/`

SSR vs CSR (very short):
- SSR: Default for server components (no "use client"); great for SEO and fast first paint.
- CSR: Add "use client" to use hooks and interactivity.

For detailed examples, commands, and best practices, see the main README:
- ./README.md
