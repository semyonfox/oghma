# Email Operations

> Status: Active operations reference
>
> Audience: Application, DNS, and company-mail administrators
>
> Last verified: 2026-09-25 against `src/lib/email.ts`, tracked env templates,
> and official Cloudflare and Resend documentation

OghmaNotes separates human mailboxes, inbound routing, and transactional app
mail. Do not make one provider responsible for a role it is not configured to
perform.

## Ownership

| Responsibility | Owner |
|---|---|
| Human inboxes on `oghmanotes.ie` | Intended owner: Google Workspace; verify live MX before changes |
| Shared root-domain addresses such as support or billing | Google Groups, aliases, or collaborative inboxes |
| Transactional application email | Resend during the closed pilot; Cloudflare remains available |
| Current application transport | Resend or Cloudflare REST API from the Node runtime, selected by `EMAIL_PROVIDER` |
| Bulk marketing/newsletters | Not Cloudflare Email Sending; choose a purpose-built provider before sending |

Project policy assigns inbound MX for the root `oghmanotes.ie` domain to Google
Workspace; this document does not prove the live DNS state. Verify the current
MX records before any change.
Cloudflare Email Routing also requires control of inbound MX, so **do not enable
Cloudflare Email Routing on the root domain while Google Workspace handles
mailboxes**.

If Email Routing is deliberately needed, configure it on a distinct subdomain
with its own MX records and documented forwarding destination. Cloudflare
supports onboarding subdomains separately. Test that subdomain without changing
the root Google MX records.

Cloudflare Email Sending is separate from Email Routing. Its bounce and
authentication records can be onboarded without moving root inbound mail away
from Google Workspace.

## Current Application Integration

`src/lib/email.ts` calls:

```text
POST https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send
```

The app is an external Node runtime, so it uses the REST API rather than a
Workers `send_email` binding.

Canonical environment variables:

| Variable | Purpose |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Account containing the onboarded sending domain |
| `CLOUDFLARE_EMAIL_API_TOKEN` | Token with Email Sending permission |
| `EMAIL_FROM` | Sender address used by the app |
| `CONTACT_TO_EMAIL` | Private recipient for website contact notifications |

`CLOUDFLARE_EMAIL_FROM` remains a compatibility fallback in code, but new
configuration should use `EMAIL_FROM`. The tracked production template
currently uses `noreply@oghmanotes.ie`.

### Optional Resend transport for the closed pilot

> **Status:** Optional transport as of 2026-09-25; Cloudflare remains the default.

Resend's free plan currently includes 3,000 outbound emails per month and a
100-email daily limit. A verified sending domain lets the app send to ordinary
recipient addresses. Test addresses do not need to be registered one by one.
The app uses Resend's REST API directly, so no additional package is needed.

To use it in an environment, verify the intended sending domain in the Resend account. Add
only the DNS records Resend provides for that domain. Check the
existing MX, SPF, DKIM, and DMARC records before editing DNS; preserve inbound
mail routing. Then set these in that environment's private runtime file:

| Variable | Value |
|---|---|
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | Sending-access key; prefer a separate key restricted to the OghmaNotes domain |
| `EMAIL_FROM` | Address at the verified sending domain |

Leave `EMAIL_PROVIDER` unset or set it to `cloudflare` to keep the existing
Cloudflare path. Do not put the API key in this repository. Resend returning an
email ID means it accepted the request, so the app reports it as `queued`.
Check the Resend delivery log and a controlled inbox for the final outcome.
To rotate the key, create a replacement in Resend, update the private env file,
redeploy the affected containers, confirm delivery, and then revoke the old key.
Changing the env file alone does not update a running container.

For Cloudflare sending, confirm that the domain portion of `EMAIL_FROM` is onboarded
in the same account as the API token. If the sender
moves to a transactional subdomain such as `notifications.oghmanotes.ie`,
onboard that subdomain first and update `EMAIL_FROM` deliberately.

Never use a founder or support mailbox as the application's sender. Do not
commit the API token or include it in logs, tickets, screenshots, or test
fixtures.

## Message Requirements

Every transactional template should include:

- a truthful, specific subject;
- a recognizable sender;
- both HTML and plain-text bodies;
- a full `https://oghmanotes.ie` link where an action is required;
- no secret value other than a single-purpose, expiring application token in
  the intended link;
- no unnecessary private study data.

Current templates cover account verification, password reset, vault job
completion, and website contact notifications. Contact notifications set the
visitor as `reply_to`; the application sender remains the verified
`EMAIL_FROM` address. When adding another template, test both body formats and
the expired/invalid-link path where applicable.

Cloudflare Email Sending is for transactional mail. Do not reuse this path for
unsolicited campaigns, scraped addresses, or broad product announcements.

## Delivery Response

A successful REST response can contain:

```json
{
  "success": true,
  "result": {
    "delivered": ["recipient@example.com"],
    "permanent_bounces": [],
    "suppressed_recipients": [],
    "queued": []
  }
}
```

HTTP success does not mean every recipient reached an inbox:

- `delivered` means accepted for immediate delivery;
- `queued` means delivery is pending;
- `permanent_bounces` means the recipient failed permanently;
- `suppressed_recipients` means the provider dropped the recipient.

The app now checks the recipient in these result arrays. Registration reports
`delivered`, `queued`, or `failed`; a bounce or suppression is a failure even when
the HTTP response succeeds. This status cannot show whether an immediately
delivered message reached the inbox or a spam folder. Verification-send errors
log a fixed reason, HTTP status, and numeric provider code without the provider
message or recipient address.

Validation/authentication errors are configuration failures, not retry
candidates. Rate limits and server failures may support bounded backoff, but
add retries only with a duplicate-send/idempotency review.

## Bounces and Suppressions

Cloudflare automatically suppresses hard-bounced addresses and may suppress
repeated failures or complaint recipients. Operators should:

- review delivery analytics and suppression lists regularly;
- investigate repeated failures by template or sender domain;
- never repeatedly retry a permanently bounced address;
- use only controlled, real inboxes for end-to-end tests;
- keep transactional and any future marketing reputation separated;
- verify SPF, DKIM, and DMARC status for the sending domain after DNS changes.

Do not remove a complaint-based suppression merely to force another send.

## End-to-End Checklist

Use a controlled non-production account and inbox:

1. Confirm Google Workspace MX remains authoritative for `oghmanotes.ie`.
2. Confirm the `EMAIL_FROM` domain is shown as ready for Email Sending.
3. Confirm app and worker containers load the same email variables without
   printing their values.
4. Register the test account and receive the verification email.
5. Verify HTML and plain-text rendering and the HTTPS verification link.
6. Complete verification and confirm the link cannot be reused improperly.
7. Request a password reset and test valid, expired, and invalid token paths.
8. Trigger a small vault completion notification if that workflow changed.
9. Check the REST result/Cloudflare analytics for delivered, queued, or bounced
   status.
10. Check that the controlled address was not unexpectedly suppressed.
11. Confirm application logs contain no API token, reset token, verification
    token, HTML body, or unnecessary recipient data.

Do not test with invented domains or nonexistent addresses; avoidable bounces
damage sender reputation.

## DNS Change Checklist

- Record the current root MX, SPF, DKIM, and DMARC state before editing.
- Keep Google Workspace MX on the root domain.
- Onboard only the intended sending domain or routing subdomain.
- Do not create multiple independent SPF TXT records for the same name.
- Verify DNS propagation and provider readiness before changing `EMAIL_FROM`.
- Send to controlled inboxes at more than one provider.
- Keep a documented rollback that restores the previous DNS records.

## Official References

- [Cloudflare Email Sending REST API](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/)
- [Email Service domain configuration](https://developers.cloudflare.com/email-service/configuration/domains/)
- [Email Service subdomains](https://developers.cloudflare.com/email-service/configuration/subdomains/)
- [Email deliverability](https://developers.cloudflare.com/email-service/concepts/deliverability/)
- [Suppression lists](https://developers.cloudflare.com/email-service/concepts/suppressions/)
- [Email Sending API schema](https://developers.cloudflare.com/api/resources/email_sending/methods/send/)
- [Resend pricing](https://resend.com/pricing)
- [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend sending-domain setup](https://resend.com/docs/dashboard/domains/introduction)

Provider behavior changes. Recheck these official sources before changing DNS,
authentication, retry behavior, limits, or billing assumptions.
