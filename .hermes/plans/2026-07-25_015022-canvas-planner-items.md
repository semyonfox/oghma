# Canvas Planner Item Contract Implementation Plan

> **For Hermes:** Implement this directly in the isolated `theo/378-canvas-planner-items` branch, then request independent review before opening a draft PR.

**Goal:** Add the backend/API contract for Canvas planner objects without corrupting assignment-specific semantics.

**Architecture:** Keep `app.assignments` assignment-shaped and add a separate `app.canvas_planner_items` table plus normalization/sync/API surfaces. The first PR deliberately stops short of wiring calendar rendering, because #380 just landed and UI overlap would be noisy.

**Tech Stack:** Next.js route handlers, Vitest, postgres tagged SQL helper, Canvas REST API client.

---

## Current context

- Clean clone: `git@github.com:semyonfox/oghma.git`, branch `dev` at `d72f31fb114dd677772b57dac519bc9516496e66`.
- Work branch: `theo/378-canvas-planner-items`.
- Existing migration numbers include multiple `049_*` files and an existing `050_privacy_safe_journey_chains.sql`, so this branch must use `051_canvas_planner_items.sql`, not the issue's earlier `050_*` suggestion.
- `src/lib/canvas/sync-assignments.js` remains untouched except for regression tests, preserving assignment filtering/status/grade/time semantics.

## Step-by-step plan

1. Add RED tests for planner normalization, sync/tombstone behavior, and API privacy.
2. Add migration `database/migrations/051_canvas_planner_items.sql`.
3. Add pure normalization helpers in `src/lib/canvas/planner-items.js`.
4. Extend Canvas client with planner, discussion, and announcement methods.
5. Add `src/lib/canvas/sync-planner-items.js` with bounded sync and fail-closed tombstoning.
6. Add `GET /api/planner/items` returning normalized public fields only.
7. Verify with targeted tests, full typecheck/lint, full Vitest suite, static scans, and independent review.

## Files changed

- Create: `database/migrations/051_canvas_planner_items.sql`
- Create: `src/lib/canvas/planner-items.js`
- Create: `src/lib/canvas/sync-planner-items.js`
- Modify: `src/lib/canvas/client.js`
- Create: `src/app/api/planner/items/route.ts`
- Create tests under `src/__tests__/api` and `src/__tests__/lib`.

## Tests / validation

```bash
npm run test:ci -- src/__tests__/lib/planner-items.test.ts src/__tests__/lib/sync-planner-items.test.ts src/__tests__/api/planner-items.test.ts src/__tests__/lib/sync-assignments.test.ts
npm run typecheck
npm run lint
npm run test:ci
```

## Risks and tradeoffs

- Migration numbering in the issue is stale; `051_*` is correct on current `dev`.
- Canvas planner payloads vary by institution. Raw JSON is stored privately for audit/migration, not exposed by API.
- Calendar rendering is intentionally left for a later UI PR.
