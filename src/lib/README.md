# src/lib — Shared utilities

Purpose: Modules that can be used by both server and client code.

Guidelines:
- Keep framework-agnostic helpers here (formatting, validation, parsing, etc.).
- If a file is server-only (DB connections, Node APIs), name it clearly and avoid importing it in client components.
- Client components can import safe utilities (no Node-only APIs, no secrets).

Typical files:
- `utils.js` — shared helpers
- `api.js` — thin client-side fetch helpers
- `db.js` (server-only) — database connection/config

For full project structure and SSR/CSR details, see: ../../README.md
