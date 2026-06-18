# Course Active/Inactive Status Plan

Status: historical implementation record.

## Goal

Allow users to mark Canvas courses active or inactive so quiz cards and assignments from inactive courses can be hidden from daily study flows while remaining available for reference.

## Scope

- Add a course settings persistence layer.
- Store active/inactive state per user and Canvas course.
- Filter quiz dashboard and quiz sessions by active courses.
- Filter assignment views by active courses.
- Add a course-list toggle in the quiz/dashboard UI.

## Key Files

| Area | Files |
|---|---|
| Migration | `database/migrations/017_user_course_settings.sql` |
| Store | `src/lib/course-settings/*` or equivalent client state |
| APIs | course settings routes, quiz dashboard/session routes, assignments routes |
| UI | course list, quiz dashboard, assignment tracker |

## Verification

- A user can mark a course inactive and active again.
- Inactive courses disappear from default quiz and assignment surfaces.
- Inactive course content remains in notes/search/reference views.
- Filters are user-scoped and do not affect other users.
