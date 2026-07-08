# Growth Funnel And Analytics Plan

Last updated: 2026-07-07

Status: lead-capture scaffolding is implemented; full analytics is not. Do not add non-essential tracking cookies, advertising pixels, or cross-site tracking without updating the cookie notice, privacy policy, and consent posture.

## Goal

Measure whether the Canvas-first landing page creates the right activation path:

> Visitor understands the promise -> starts signup -> connects Canvas -> sees a limited import -> reaches a useful first study action -> considers semester pricing.

The funnel should validate positioning before optimising paid acquisition.

## Primary Funnel

| Stage | Event | Why it matters |
|---|---|---|
| Public page view | `public_page_view` | Baseline traffic by page and source |
| Hero CTA click | `hero_connect_canvas_click` | Measures whether the new promise is compelling |
| Comparison CTA click | `notebooklm_compare_click` | Measures competitor-intent interest |
| Pricing view | `pricing_view` | Measures commercial curiosity |
| Register started | `register_started` | First high-intent step |
| Account created | `account_created` | Signup conversion |
| Email verified | `email_verified` | Activation quality |
| Canvas connect started | `canvas_connect_started` | Core value path started |
| Canvas connect completed | `canvas_connect_completed` | Permission/setup success |
| Import estimate viewed | `canvas_import_estimate_viewed` | Large-import cost control moment |
| Import confirmed | `canvas_import_confirmed` | Student accepts import workload |
| Import completed | `canvas_import_completed` | Magic moment delivered |
| First cited answer | `first_cited_answer` | AI study value reached |
| First flashcard generated | `first_flashcard_generated` | Active recall value reached |
| Pricing after activation | `pricing_view_after_import` | Paid conversion intent |
| Checkout click | `checkout_click` | Paid intent |
| Checkout completed | `checkout_completed` | Revenue |

## Implemented Now

Contact form lead fields are collected through Web3Forms:

- first name
- last name
- email
- role
- interest
- university or organization
- phone number
- message
- hidden subject/from-name fields for lead routing

Public CTAs use UTM-bearing URLs for source attribution scaffolding.

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

## Not Implemented Yet

There is still no first-party analytics or event pipeline:

- no GA4, GTM, Plausible, PostHog, Mixpanel, or Umami
- no CTA-click event collection
- no registration attribution persistence
- no first-party lead table
- no UTM persistence into contact or user records
- no dashboard for activation or import funnel metrics

## CTA Naming

Use stable UTM and event names:

- `hero_connect_canvas`
- `midpage_free_import`
- `notebooklm_comparison`
- `pricing_semester`
- `pricing_academic_year`
- `student_group_contact`
- `campus_pilot_contact`
- `blog_to_register`
- `footer_contact`

## UTM Policy

Preserve incoming UTMs through signup where possible:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- first landing page
- referrer

Store attribution server-side after account creation if privacy policy and consent posture allow it. Do not rely only on client local storage for attribution.

## Recommended Initial Dashboard

Track weekly:

- homepage visitors
- CTA click-through rate
- register-start rate
- account-created rate
- Canvas-connect-start rate
- Canvas-connect-complete rate
- import-complete rate
- first-cited-answer rate
- first-flashcard rate
- pricing-after-import rate
- support/contact messages about privacy or Canvas access
- import failure rate and median time to indexed material

## Experiment Backlog

Run only one or two changes at a time until there is enough traffic.

1. Hero headline: "Your whole semester, already loaded" vs "Connect Canvas once and start revising".
2. CTA: "Connect Canvas free" vs "Import one module free".
3. Pricing anchor: semester-first vs annual-first.
4. NotebookLM comparison placement: above features vs below features.
5. Free tier explanation: one-module import vs page-count import.

## Privacy Notes

Current public cookie copy says OghmaNotes does not use non-essential analytics cookies, advertising pixels, or cross-site tracking cookies. If analytics is added:

- update `/cookies`
- update `/privacy`
- decide whether consent is needed
- document provider, retention, and data residency
- avoid sending note content, Canvas tokens, or course file text to analytics tools

## Bot And GEO Monitoring

Monitor server logs for crawler and answer-engine user agents:

- `OAI-SearchBot`
- `GPTBot`
- `ClaudeBot`
- `PerplexityBot`
- `Google-Extended`
- `Bingbot`

Also set up:

- Google Search Console
- Bing Webmaster Tools
- sitemap validation
- checks that `/llms.txt`, `/llms-full.txt`, `/ai.md`, `/faq.md`, and `/pricing.md` return 200

## Owner Decision Needed

Before implementing analytics code, decide:

- analytics provider
- consent/cookie posture
- retention period
- whether attribution is stored before or after account creation
- who reviews the dashboard weekly
