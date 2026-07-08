# Handover: Agentic GEO, LLM Visibility, Funnel Capture

Date: 2026-07-08  
Branch: `landing-page-pivot`  
Worktree: `/home/semyon/code/university/ct216-software-eng/oghmanotes-landing-pivot`

## Executive Summary

This branch combines the Canvas-first landing-page pivot with agentic GEO and lead-capture scaffolding.

The public positioning is now:

> Your whole semester, already loaded.

The site now has:

- Canvas-first homepage copy and CTAs.
- NotebookLM comparison.
- Semester-first pricing framing.
- Fake testimonials removed.
- Public machine-readable AI/agent resources.
- Richer Web3Forms lead capture fields.
- UTM-bearing CTAs.

## Data Collection Status

### Implemented

`src/components/contact-form.jsx` collects:

- first name
- last name
- email
- role
- interest
- university or organization
- phone number
- message
- hidden `subject = OghmaNotes website lead`
- hidden `from_name = OghmaNotes website`

Submissions still go through Web3Forms via `NEXT_PUBLIC_WEB3FORMS_KEY`.

Public CTAs include UTM parameters for source attribution scaffolding.

### Not Implemented

No full analytics stack exists yet:

- no GA4/GTM
- no Plausible/PostHog/Mixpanel/Umami
- no first-party event endpoint
- no first-party lead table
- no UTM persistence into registration
- no CTA-click event tracking
- no activation funnel dashboard

Cookie/privacy posture currently says there are no non-essential analytics cookies. Update `/cookies`, `/privacy`, and consent behavior before adding analytics scripts or pixels.

## Agentic Public Routes

Implemented route-backed resources:

- `GET /ai`
- `GET /ai` with `Accept: text/markdown`
- `GET /ai?format=md`
- `GET /ai.md`
- `GET /llms.txt`
- `GET /llms-full.txt`
- `GET /agents.md`
- `GET /faq.md`
- `GET /pricing.md`
- `GET /agent-api.json`
- `GET /agent-sitemap.xml`

Canonical source:

- `src/lib/public/agent-content.js`

## Verification Commands

```bash
npm run test -- src/__tests__/app/sitemap-robots.test.ts src/__tests__/app/agent-content-routes.test.ts
npx eslint src/lib/public/agent-content.js src/app/agent-api.json/route.js src/app/ai/page.jsx src/app/ai.md/route.js src/app/agents.md/route.js src/app/faq.md/route.js src/app/llms.txt/route.js src/app/llms-full.txt/route.js src/app/pricing.md/route.js src/app/agent-sitemap.xml/route.js src/proxy.ts src/app/robots.js src/app/sitemap.js src/app/layout.js src/components/footer.jsx src/components/contact-form.jsx src/__tests__/app/sitemap-robots.test.ts src/__tests__/app/agent-content-routes.test.ts
npm run build
```

`next build` temporarily rewrites `next-env.d.ts` from dev route types to production route types. Restore that generated churn after verification.

## Manual Deploy Checks

```bash
curl -I https://oghmanotes.ie/ai
curl -H "Accept: text/markdown" https://oghmanotes.ie/ai | head -40
curl https://oghmanotes.ie/ai?format=md | head -40
curl -I https://oghmanotes.ie/ai.md
curl https://oghmanotes.ie/llms.txt | head -40
curl https://oghmanotes.ie/agent-api.json | jq '.openapi, .paths["/api/auth/register"].post.summary'
curl https://oghmanotes.ie/agent-sitemap.xml
curl https://oghmanotes.ie/robots.txt
curl https://oghmanotes.ie/sitemap.xml | grep -E "ai.md|agent-api|llms"
```

## Recommended Next Steps

1. Decide analytics provider and consent posture.
2. Add first-party attribution persistence for register/contact flows.
3. Add event tracking for CTA click, register started, account created, Canvas connect, import estimate, import complete, first cited answer, first flashcard, and pricing-after-import.
4. Add a lead table if Web3Forms becomes insufficient.
5. Add comparison pages once the homepage pivot is accepted.
