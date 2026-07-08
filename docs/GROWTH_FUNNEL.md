# Growth Funnel And Analytics

Last updated: 2026-07-08

Status: privacy-light first-party tracking is implemented. There is no GA4, GTM, third-party analytics script, advertising pixel, session replay, heatmap tool, or analytics cookie.

## Goal

Measure whether the Canvas-first landing page creates the right activation path:

> Visitor understands the promise -> clicks a Canvas-first CTA -> starts signup -> creates an account -> connects Canvas -> reaches the import/study workflow.

The funnel should validate positioning before paid acquisition or heavier analytics.

## Implemented

First-party event collection:

- `POST /api/marketing/events`
- stores into `app.marketing_events`
- anonymous session id kept in `sessionStorage`
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
| `page_view` | public pages | traffic by path, referrer, and UTM |
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

## Attribution

The client captures these UTM fields from the URL and keeps them in `sessionStorage` for the browser session:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`

Events store last-touch UTM fields directly. Registration, Canvas connect, and contact submissions also include the session-scoped first-touch object in sanitized JSON properties.

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

Signup funnel by session:

```sql
SELECT
  count(DISTINCT session_id) FILTER (WHERE event_name = 'page_view' AND path LIKE '/register%') AS register_visitors,
  count(DISTINCT session_id) FILTER (WHERE event_name = 'registration_form_start') AS form_starts,
  count(DISTINCT session_id) FILTER (WHERE event_name = 'registration_submit') AS submits,
  count(DISTINCT session_id) FILTER (WHERE event_name = 'registration_success') AS account_created
FROM app.marketing_events
WHERE occurred_at >= now() - interval '30 days';
```

Canvas activation after signup:

```sql
SELECT
  count(DISTINCT session_id) FILTER (WHERE event_name = 'registration_success') AS account_created,
  count(DISTINCT session_id) FILTER (WHERE event_name = 'canvas_connect_attempt') AS canvas_attempted,
  count(DISTINCT session_id) FILTER (WHERE event_name = 'canvas_connect_success') AS canvas_connected
FROM app.marketing_events
WHERE occurred_at >= now() - interval '30 days';
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

- analytics dashboard UI
- email verification event
- Canvas import started/completed events
- first cited answer event
- first flashcard generated event
- checkout/paid conversion events
- retention policy job for marketing tables

## Next Product Events

Add these when the relevant surfaces are ready:

- `email_verified`
- `canvas_import_started`
- `canvas_import_completed`
- `first_cited_answer`
- `first_flashcard_generated`
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
