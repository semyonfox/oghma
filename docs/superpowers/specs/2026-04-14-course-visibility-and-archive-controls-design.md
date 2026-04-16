# Course Visibility And Archive Controls Design

## Goal

Make course visibility reliable and low-noise.

Users should be able to mark courses active or archived, have archived courses disappear from quiz counts, quiz selection, assignments, and task-style views by default, and still be able to reveal them when they need to look back.

## Current Problems

- Quiz course archiving is not the single source of truth in the rendered UI.
- Quiz dashboard totals still count archived-course cards, so the numbers do not match what can actually be reviewed.
- Assignments do not consistently refetch when the archived filter changes.
- The current eye buttons are too local and too prominent for a feature that should be available but secondary.

## Scope

This design covers:

- fixing the current archived-course behavior
- replacing the per-row primary archive controls with a shared management flow
- reusing the same management UI from quiz, assignments, and settings

This design does not cover:

- automatic archiving heuristics from Canvas metadata
- bulk smart suggestions based on year codes or terms
- permanent deletion of course visibility settings

## Data Model

`app.user_course_settings` remains the source of truth for per-user course visibility.

Relevant fields:

- `user_id`
- `canvas_course_id`
- `course_name`
- `is_active`
- `auto_archived`
- `archived_at`

Behavior:

- if no row exists for a course, it is treated as active
- if a row exists with `is_active = false`, the course is archived
- UI state such as `showArchived` remains local/persisted in client stores, but course visibility itself stays server-backed

## Architecture

### Server

Server queries that expose course-backed quiz or assignment data must consistently apply the same rule:

- include course if `user_course_settings` row is missing
- exclude course only when `is_active = false`

Affected surfaces:

- quiz dashboard course list
- quiz dashboard aggregate stats
- quiz session candidate selection
- assignments list

This keeps visible counts aligned with visible content.

### Client

The client should not treat `useCourseStore.settings` and `useQuizStore.courses` as separate competing truths.

Instead:

- archive/unarchive actions call the course settings API
- after success, dependent data is refreshed from the server
- rendered lists come from refreshed server data

This avoids stale UI and prevents local optimistic state from drifting from the database.

## UX Design

### Primary Control Pattern

Use a shared `Manage course visibility` modal as the main control surface.

Entry points:

- quiz dashboard: small `Manage` button beside course search
- assignments panel: small `Manage` button beside filters
- settings page: reusable section using the same management component

The button should read like a secondary control, not a primary call to action.

### Modal Layout

The modal uses one searchable list, sorted active first and archived second.

Structure:

1. search field at top
2. optional bulk actions row
3. active courses section
4. archived courses section

Each row includes:

- course name
- optional small context text if available, such as counts already present in the invoking surface
- active/inactive toggle

The list remains one continuous management view, but with an archived divider so the state is obvious.

### Bulk Actions

Keep bulk actions minimal:

- `Archive all with no due items` for the current visible dataset when that information is available
- `Restore all archived`

If the invoking context does not have enough information for the first action, omit it rather than inventing inconsistent rules.

### Browsing Archived Content

Keep a small `Show archived` toggle in quiz and assignments.

That toggle is for browsing archived material, not for changing archive state.

Behavior:

- off by default
- persisted per feature where already supported
- when enabled, archived items reappear in their own filtered section/listing

## Detailed Behavior

### Quiz Dashboard

- archived courses do not contribute to dashboard totals
- archived courses do not contribute to `All My Notes` review selection
- archived courses do not appear in the default course list
- when `Show archived` is enabled, archived courses appear below active ones in a visually separated section
- `Manage course visibility` opens the shared modal

### Assignments

- assignments for archived Canvas courses are hidden by default
- when `Show archived` is enabled, they reappear
- the assignments store persists `includeArchived` just like `includeAll`
- changing archived visibility immediately refetches assignments
- `Manage course visibility` opens the shared modal

### Settings

- add a `Course visibility` section that reuses the same management list component
- settings becomes the stable home for this feature, even though quiz and assignments keep shortcut entry points

## Components

### New Reusable Component

Create a shared management component for course visibility instead of embedding archive controls separately in quiz and assignments.

Responsibilities:

- fetch or receive course rows
- filter by search text
- sort active first, archived second, then alphabetically within each section
- render per-course toggle actions
- optionally expose bulk actions

This component can be rendered inside:

- a modal wrapper for quiz and assignments
- a settings section wrapper

### Existing Components

Update existing components to consume the shared management flow:

- `quiz/course-list.tsx`
- `quiz/dashboard.tsx`
- `panels/assignment-tracker.tsx`

Remove the per-row eye button as the primary archive affordance once the modal exists.

## State Flow

### Archive Toggle

When the user toggles a course in the shared manager:

1. send API request to create or update `user_course_settings`
2. update course settings store
3. refetch dependent data for the current surface
4. rerender using fresh server-backed data

Dependent refreshes:

- quiz surface refreshes dashboard stats and course list
- assignments surface refreshes assignment list

### Show Archived Toggle

When the user toggles `Show archived`:

- no database write occurs
- only the visible dataset changes
- persisted client state is reused on next load where applicable

## Error Handling

- failed archive/unarchive requests should show a toast and leave UI unchanged
- failed data refresh after a successful archive toggle should show a toast and allow manual retry
- missing course settings row is not an error condition; it means active by default

## Performance

- the extra `LEFT JOIN app.user_course_settings` remains cheap because the table is keyed by user and course
- avoid duplicate client-side truth sources for course visibility
- keep filtering and sectioning in memoized client selectors where the component already derives lists
- prefer server refresh after mutation over adding complex optimistic reconciliation across quiz and assignments stores

## Testing

### Functional

- archive a course and verify it disappears from quiz default list
- verify archived course cards are excluded from quiz totals and `All My Notes`
- enable `Show archived` and verify archived courses reappear in a separate section
- archive a course and verify its assignments disappear by default
- enable assignments `Show archived` and verify they reappear
- open the manager from quiz and assignments and confirm both modify the same underlying state
- verify settings view shows the same active/archived result

### Regression

- courses without `user_course_settings` row still behave as active
- manual assignments without Canvas course linkage remain visible
- sync/refetch preserves persisted `includeAll` and `includeArchived`

## Implementation Notes

- fix current wiring bugs first, then layer in the shared manager UI
- keep the current database schema unless implementation uncovers a concrete missing field
- do not add heuristic auto-archive logic in this pass
