# Growth Funnel And Analytics

Last updated: 2026-07-11

Status: privacy-first aggregate first-party tracking is implemented. There is no GA4, GTM, third-party analytics script, advertising pixel, session replay, heatmap tool, analytics cookie, or anonymous browser identifier.

## Goal

Measure whether the Canvas-first landing page creates the right activation path:

> Visitor understands the promise -> clicks a Canvas-first CTA -> starts signup -> creates an account -> connects Canvas -> reaches the import/study workflow.

The funnel should validate positioning before paid acquisition or heavier analytics.

## Implemented

First-party event collection:

- `POST /api/marketing/events`
- stores into `app.marketing_events`
- no anonymous/session identifier; the retired `oghma_marketing_session` key is cleared
- DNT and Global Privacy Control suppress collection and clear attribution storage
- query strings, fragments, raw IPs, and user agents are not stored
- raw events have a 30-day purge function (`app.purge_expired_marketing_events`)
- no cookies
- no raw IP storage
- no third-party analytics provider
- no note text, Canvas tokens, uploaded documents, names, emails, phone numbers, or contact messages in the event table

First-party lead capture:

- `POST /api/contact`
- stores contact submissions in `app.marketing_leads`
- forwards to Web3Forms server-side when `WEB3FORMS_KEY` or `NEXT_PUBLIC_WEB3FORMS_KEY` is configured
- keeps Web3Forms as delivery, not the only source of truth

Tracked events:

| Event | Source | Purpose |
|---|---|---|
| `page_view` | public pages | traffic by allowlisted path and UTM |
| `navigation_transition` | public page loads and internal links | aggregate `from_path`/`to_path`, direct/external/internal origin, and marked CTA/header/footer context |
| `nav_click` | public links | navigation/item-click visibility |
| `cta_click` | marked CTAs | high-intent CTA conversion |
| `pricing_click` | pricing CTAs | commercial curiosity |
| `contact_form_start` | contact form | form engagement |
| `contact_form_submit` | contact form | submit attempt |
| `contact_form_success` | contact client/API | submitted lead |
| `contact_form_error` | contact form | failed lead flow |
| `registration_form_start` | register page | signup intent |
| `registration_submit` | register page | validated signup submit |
| `registration_success` | register client/API | account created; server event is canonical |
| `registration_error` | register page | validation/API failure bucket |
| `registration_oauth_start` | register page | OAuth intent |
| `registration_oauth_unavailable` | register page | provider config issue |
| `canvas_connect_attempt` | settings Canvas form | core activation attempt |
| `canvas_connect_success` | settings/API | Canvas connected; server event is canonical |
| `canvas_connect_error` | settings Canvas form | setup failure bucket |
| `email_verified` | email verification route | first successful verification for an authenticated account |
| `canvas_import_started` | Canvas import route | first successfully queued Canvas import for an authenticated account |
| `canvas_import_completed` | Canvas/vault workers | first completed import for an authenticated account |
| `first_cited_answer` | chat route | first completed answer with one or more retrieved sources |
| `first_flashcard_generated` | import workers | first generated study question/flashcard for an authenticated account |

## Authenticated Activation Milestones

The five first-value milestones are server-canonical and store only the account UUID, fixed event name, and timestamp. They accept no path, metadata, note/document content, Canvas domain/token, or browser/session identifier. A partial unique index makes each milestone idempotent per account. Direct HTTP milestone routes honor DNT/GPC. Delayed workers do not write activation milestones: they cannot observe the original browser preference, and there is no durable analytics-consent setting.

A return/weekly-active metric is deliberately **not** collected: defining it would require recording routine account activity beyond these product milestones. The dashboard instead exposes only the existing 30-day, minimum-five-account aggregate milestone counts.

## Attribution

When DNT/GPC are not enabled, the client reads UTM fields from the current page URL and attaches only values from the deployed attribution taxonomy to that event. Unknown values (including email-like or other free-form query text) are discarded rather than persisted. The currently allowed values are the product-owned sources `homepage`, `ai_page`, and `pricing`; media `hero_cta`, `midpage_cta`, and `cta`; and campaigns `free_canvas_import`, `semester_pricing`, `campus_pilot`, and `launch_beta`. `utm_content` and `utm_term` are intentionally not retained.

- `utm_source`
- `utm_medium`
- `utm_campaign`

Analytics does not write cookies, `localStorage`, or `sessionStorage`. Attribution is deliberately event-level rather than visitor-level, so anonymous journeys cannot be stitched together.

Navigation transitions use a separate strict allowlist: stable public paths (plus slug-shaped public blog paths), `direct`/`external`/`internal` origin, and the existing semantic CTA/header/footer placement/action values. Query strings, fragments, referrers, external destinations, dynamic application paths, and unmarked free-form labels are discarded. Public ingestion also drops free-form source and target fields and uses a closed aggregate property schema; a transition is one independent event, not a retained visitor trail.

## Privacy Boundaries

Do not add these without a separate consent/privacy pass:

- GA4/GTM
- Meta/TikTok/Reddit/LinkedIn pixels
- PostHog/Mixpanel/Plausible/Umami hosted scripts
- heatmaps
- session replay
- persistent analytics cookies
- cross-site identifiers

Never send these into `app.marketing_events`:

- names
- emails
- phone numbers
- contact messages
- passwords
- Canvas tokens
- Canvas domain values
- note text
- file/document content
- raw IP addresses

`app.marketing_leads` is the exception for contact details because visitors explicitly submit those fields through the contact form.

## Aggregate Admin Dashboard

`/admin/analytics` uses fixed aggregate queries from `/api/admin/analytics`. Access is restricted to signed-in emails in the comma-separated `ANALYTICS_ADMIN_EMAILS` environment variable. Campaign, navigation, CTA, and authenticated activation cells below five accounts/events are suppressed, and there is no raw-event or user/session drill-down.

A future shared view should publish aggregate daily metrics to Grafana or Metabase. Do not centralize raw cross-app user events or create a shared person identifier.

## Useful Queries

Daily event counts:

```sql
SELECT
  date_trunc('day', occurred_at) AS day,
  event_name,
  count(*) AS events
FROM app.marketing_events
GROUP BY 1, 2
ORDER BY 1 DESC, 2;
```

Homepage CTA conversion by campaign:

```sql
SELECT
  utm_campaign,
  properties->>'location' AS location,
  properties->>'cta' AS cta,
  count(*) AS clicks
FROM app.marketing_events
WHERE event_name IN ('cta_click', 'pricing_click')
GROUP BY 1, 2, 3
ORDER BY clicks DESC;
```

Aggregate navigation and semantic CTA placement (the dashboard runs this with a 30-day window and suppresses cells below five events):

```sql
SELECT
  coalesce(from_path, '(entry)') AS from_path,
  to_path,
  origin_class,
  coalesce(placement, '(unmarked)') AS placement,
  coalesce(action, '(unmarked)') AS action,
  count(*) AS events
FROM app.marketing_events
WHERE event_name = 'navigation_transition'
  AND to_path IS NOT NULL
GROUP BY 1, 2, 3, 4, 5
HAVING count(*) >= 5
ORDER BY events DESC;
```

Anonymous signup-stage event totals (not linked into visitor journeys):

```sql
SELECT
  count(*) FILTER (WHERE event_name = 'page_view' AND path = '/register') AS register_views,
  count(*) FILTER (WHERE event_name = 'registration_form_start') AS form_starts,
  count(*) FILTER (WHERE event_name = 'registration_submit') AS submits,
  count(*) FILTER (WHERE event_name = 'registration_success') AS accounts_created
FROM app.marketing_events
WHERE occurred_at >= now() - interval '30 days';
```

Authenticated Canvas activation:

```sql
SELECT
  count(DISTINCT user_id) FILTER (WHERE event_name = 'registration_success') AS accounts_created,
  count(DISTINCT user_id) FILTER (WHERE event_name = 'canvas_connect_attempt') AS canvas_attempted,
  count(DISTINCT user_id) FILTER (WHERE event_name = 'canvas_connect_success') AS canvas_connected
FROM app.marketing_events
WHERE occurred_at >= now() - interval '30 days'
  AND user_id IS NOT NULL;
```

Contact leads by intent:

```sql
SELECT
  interest,
  role,
  utm_campaign,
  count(*) AS leads,
  count(*) FILTER (WHERE forwarded_to_web3forms) AS forwarded
FROM app.marketing_leads
GROUP BY 1, 2, 3
ORDER BY leads DESC;
```

## Still Missing

These are intentionally not in this pass:

- return/weekly-active tracking (would require routine activity tracking beyond the first-value milestones)
- checkout/paid conversion events
- scheduler invocation for the provided 30-day retention function

## Next Product Events

Add these when the relevant surfaces are ready:

- `pricing_view_after_import`
- `checkout_click`
- `checkout_completed`

## GEO Monitoring

Machine-readable GEO/AEO routes are implemented:

- `/ai`
- `/ai.md`
- `/llms.txt`
- `/llms-full.txt`
- `/agents.md`
- `/faq.md`
- `/pricing.md`
- `/agent-api.json`
- `/agent-sitemap.xml`

Monitor server logs for crawler and answer-engine user agents:

- `OAI-SearchBot`
- `GPTBot`
- `ClaudeBot`
- `PerplexityBot`
- `Google-Extended`
- `Bingbot`
