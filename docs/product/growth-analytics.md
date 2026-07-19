# Growth Analytics

> **Status:** Privacy-first collection is in `dev` history; the aggregate `/analytics` dashboard and scheduled retention cleanup are implemented in this checkout. Production migration, configuration, and deployment remain unverified.
> **Last reviewed:** 2026-07-12
> **Source of truth for:** Funnel events, attribution boundaries, dashboard access, and marketing-data retention.

## Goal

Measure whether the Canvas-first positioning leads visitors through the core activation path:

> Understand the promise -> choose a Canvas-first action -> register -> verify email -> connect Canvas -> import material -> reach a useful study action.

Use aggregate evidence to improve positioning and onboarding without building visitor profiles.

## Privacy Model

The browser sends storage-free first-party observations to `POST /api/marketing/events`. The implementation:

- stores no visitor or session identifier;
- stores no raw IP address, user agent, query string, arbitrary referrer, or browser timestamp;
- retires session-storage keys created by the older analytics implementation;
- honors Global Privacy Control and Do Not Track in both browser and server paths;
- accepts only allowlisted public paths, UI placements, actions, and campaign values;
- exposes aggregate reports only and suppresses dimension cells below five observations;
- loads no third-party analytics, advertising pixel, replay, heatmap, or fingerprinting script.

`app.marketing_leads` remains separate because visitors intentionally submit contact details. Raw lead access is not exposed through the analytics dashboard.

## Event Contract

| Event | Canonical source | Meaning |
|---|---|---|
| `page_view` | public tracker | aggregate public-page traffic |
| `navigation_transition` | public tracker | allowlisted from/to path and coarse origin |
| `cta_click`, `nav_click`, `pricing_click` | public tracker | aggregate interaction counts |
| `contact_form_start`, `contact_form_submit`, `contact_form_success`, `contact_form_error` | contact client/API | lead funnel state |
| `registration_form_start`, `registration_submit`, `registration_success`, `registration_error` | registration client/API | account creation funnel |
| `registration_oauth_start`, `registration_oauth_unavailable` | registration page | OAuth intent or configuration issue |
| `canvas_connect_attempt`, `canvas_connect_success`, `canvas_connect_error` | Canvas settings/API | connection funnel |
| `email_verified` | verification API | first verified-account milestone |
| `canvas_import_started` | import API | first import-start milestone |
| `canvas_import_completed` | import workers | first completed-import milestone |
| `first_cited_answer` | chat API | first cited-answer milestone |
| `first_flashcard_generated` | quiz generation | first generated-flashcard milestone |

Authenticated milestones are idempotent through the partial unique index in migration `038_activation_milestones.sql`.

## Attribution

Attribution is intentionally coarse and storage-free:

- entry origin is `direct`, `external`, or `internal`;
- only deliberately deployed UTM source, medium, and campaign values are accepted;
- unknown query-derived values are discarded;
- external referrer hostnames and individual visitor trails are not retained.

Add a value to `src/lib/marketing/attribution.ts` only when that campaign is intentionally deployed.

## Dashboard Access

`/analytics` is server-rendered. Signed-out users are redirected to login; signed-in users whose normalized email is absent from `ANALYTICS_ADMIN_EMAILS` receive a 404. `/admin/analytics` redirects to the same canonical page.

The dashboard offers 7-, 30-, and 90-day windows for:

- page views, aggregate navigation, CTA actions, registrations, and contact leads;
- daily traffic;
- coarse entry origin and landing paths;
- approved campaign dimensions;
- popular public pages, aggregate transitions, CTA placement/action, and destinations;
- registration, contact, verification, Canvas, cited-answer, and flashcard milestones.

## Retention

The Canvas worker runs cleanup at startup and every 24 hours:

| Data | Default | Environment variable |
|---|---:|---|
| Marketing observations | 30 days | `MARKETING_EVENTS_RETENTION_DAYS` |
| Intentionally submitted leads | 365 days | `MARKETING_LEADS_RETENTION_DAYS` |

Values are bounded to 30-3,650 days. Migration 036 also provides `app.purge_expired_marketing_events(interval)` for operational use.

## Lead Delivery

Contact submissions are validated, rate-limited, and checked with an HTML-form
honeypot before durable storage. The lead row is inserted before the server
attempts Web3Forms notification delivery. `WEB3FORMS_ACCESS_KEY` is server-only;
delivery failures are recorded on the durable lead and do not ask the browser
to retry an already stored submission.

## Verification

Before production deployment:

- run migrations 036-038;
- configure `ANALYTICS_ADMIN_EMAILS` and retention values in both Jenkins env files;
- confirm signed-out redirect, non-admin 404, and admin aggregate rendering;
- verify GPC/DNT requests produce no stored event;
- verify unexpected paths, properties, campaigns, and event names are rejected;
- verify the completion and flashcard milestone producers against a
  non-production database;
- observe one cleanup run against non-production data.

## Next Events

Add these only when the corresponding product surfaces exist:

- `pricing_view_after_import`
- `checkout_click`
- `checkout_completed`

Machine-readable route ownership and crawler monitoring belong in [AI agent compatibility](../engineering/agent-compatibility.md).
