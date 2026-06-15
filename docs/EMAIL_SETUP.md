# OghmaNotes Email Setup

Last updated: 2026-06-15. Recheck provider pricing before changing billing or infrastructure.

## Recommended Setup

Use one company domain: `oghmanotes.ie`.

Create **2 real inboxes** for actual people:

- `semyon@oghmanotes.ie`
- `shrey@oghmanotes.ie`

These should live on **Google Workspace**, not Cloudflare. Cloudflare is useful for routing and transactional mail, but it is not the main founder mailbox host.

Launch decision: use **Cloudflare Email Sending** for app-generated transactional email. Keep AWS SES as a fallback only.

## How To Split Email Responsibilities

### 1. Real inboxes

These are the only paid mailboxes to start with:

- `semyon@oghmanotes.ie`
- `shrey@oghmanotes.ie`

Rule: people get inboxes.

### 2. Shared business addresses

Use Google Groups or a collaborative inbox for addresses like:

- `support@oghmanotes.ie`
- `billing@oghmanotes.ie`
- `hello@oghmanotes.ie`
- `privacy@oghmanotes.ie`
- `security@oghmanotes.ie`
- `admin@oghmanotes.ie`

Rule: functions get groups or shared inboxes, not separate paid users unless there is a real need.

### 3. Service-specific addresses

Use aliases or forwarding for low-volume service addresses like:

- `aws@oghmanotes.ie`
- `stripe@oghmanotes.ie`
- `github@oghmanotes.ie`
- `openai@oghmanotes.ie`
- `cloudflare@oghmanotes.ie`
- `domain@oghmanotes.ie`

Rule: services get aliases, not full mailboxes.

### 4. App-generated mail

Do not send product emails from founder inboxes or support inboxes.

Use a dedicated transactional sender such as:

- `no-reply@notifications.oghmanotes.ie`

That sender should be used for:

- password reset
- email verification
- account notifications
- background job completion emails

Current implementation note: OghmaNotes still uses AWS SES-style SMTP environment names in `src/lib/email.js`. Before the Cloudflare email cutover, make the mail transport provider-neutral with generic `SMTP_*` env vars or point the existing SMTP transport at Cloudflare's SMTP settings if compatible. Treat SES as a fallback, not the launch default.

## Where Cloudflare Fits

Cloudflare is useful, but only for part of the system.

### Cloudflare can do

- inbound alias forwarding with Email Routing
- outbound transactional app mail with Email Sending
- DNS for the email domain and subdomains

### Cloudflare should not do here

- founder/staff primary inbox hosting
- replacing Google Workspace for normal day-to-day company mail

Practical summary:

- Google Workspace handles human inboxes
- Google Groups handles shared team addresses
- Cloudflare handles alias forwarding where useful
- Cloudflare Email Sending handles app outbound mail for launch
- SES remains a fallback if Cloudflare deliverability or implementation becomes a problem

## Cost Summary

### Google Workspace

Business Starter is the sensible default for Oghma at this stage.

Current official pricing checked on 2026-06-15:

- `$7/user/month` on annual billing
- `$8.40/user/month` on flexible billing

For 2 users, that means:

- **$14/month** on annual billing
- **$16.80/month** on flexible billing

Shared addresses and aliases usually do **not** require extra paid inboxes if they are set up as Groups, aliases, or forwards.

### Cloudflare Email Routing

Inbound alias forwarding is effectively **free** on the current Cloudflare email offering.

This is useful for addresses like `aws@`, `stripe@`, or `github@` if they just need to land in one of the real inboxes.

### Cloudflare Email Sending

If used for transactional outbound mail:

- requires **Workers Paid**
- base cost is **$5/month**
- includes **3,000 outbound emails/month**
- then **$0.35 per 1,000 emails**

### AWS SES

If used for transactional outbound mail instead:

- outbound email is **$0.10 per 1,000 emails**
- small attachment/data charges can apply
- current free tier is **3,000 message charges/month for the first 12 months** after starting SES, not forever

For a low-volume product like Oghma, SES is cheaper than Cloudflare Email Sending if the only question is marginal outbound cost. It is no longer the preferred launch path because Cloudflare is already the target edge/storage/email provider and expected app email volume should stay below 3,000/month early on.

## Recommended Low-Complexity Setup

For launch, the clean setup is:

- 2 Google Workspace inboxes for the founders
- Google Groups for shared addresses
- Cloudflare Email Routing for low-volume aliases where useful
- Cloudflare Email Sending for transactional outbound app mail

That keeps the recurring email setup roughly at:

- **$14/month** on annual Google Workspace billing, plus Workers Paid if not already needed elsewhere
- or **$16.80/month** on flexible Google Workspace billing, plus Workers Paid if not already needed elsewhere

## Why This Is The Recommended Split

This keeps ownership and operations clear:

- founder communication stays in real business inboxes
- support and admin addresses stay company-controlled
- service accounts do not require extra paid seats
- app mail has its own sending reputation and can be swapped between SES and Cloudflare later

The key principle is simple:

**People get inboxes. Functions get groups. Services get aliases. App mail gets a dedicated transactional sender.**

## Sources To Recheck

- Google Workspace Business editions: https://knowledge.workspace.google.com/admin/getting-started/editions/business-editions
- Cloudflare Email Service pricing: https://developers.cloudflare.com/email-service/platform/pricing/
- AWS SES pricing: https://aws.amazon.com/ses/pricing/
