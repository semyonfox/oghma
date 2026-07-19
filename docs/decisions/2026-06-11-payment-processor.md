# ADR: Stripe Managed Payments For Initial Paid Subscriptions

> **Status:** Accepted, conditional on current eligibility and terms
> **Decision date:** 2026-06-11
> **Last reviewed:** 2026-07-11
> **Source of truth for:** The initial payment-processor choice and its architectural consequences. Prices and entitlements live in [pricing.md](../product/pricing.md).

## Context

OghmaNotes expects low initial payment volume and wants a Merchant of Record arrangement for supported digital subscriptions rather than taking on the transaction-tax administration of plain payment processing at launch.

The team also needs mature hosted checkout, subscriptions, a customer portal, webhooks, test mode, dashboard diagnostics, and practical Irish payouts. Provider eligibility, supported-product rules, fees, payout terms, and tax scope can change and must be rechecked before implementation.

## Decision

Use **Stripe Managed Payments** for the first paid OghmaNotes subscriptions, subject to Stripe enabling the product for the company and approving the use case.

This decision is specifically for Stripe's Merchant of Record offering, not ordinary Stripe Checkout or Billing on its own.

## Why

- It matches the launch requirement for a Merchant of Record on supported sales.
- It keeps checkout, subscription management, customer self-service, webhooks, and diagnostics in one mature integration.
- It is suitable for a low-volume launch if the current payout and account terms remain acceptable.
- A provider-neutral local billing model limits switching cost if eligibility or economics change.

The decision does not delegate company bookkeeping, Corporation Tax, founder taxation, CRO/RBO obligations, or every VAT question to Stripe. Those remain part of [company-admin.md](../product/company-admin.md) and professional advice.

## Consequences

The application should store provider-neutral billing state, including:

- billing provider;
- provider customer and subscription identifiers;
- plan and billing status;
- current billing period end.

Webhook processing should update local state idempotently. Product access should be gated from that verified local state, not from a live provider request on every action.

Before live checkout, test:

- checkout completion and abandoned checkout;
- subscription creation, change, cancellation, and expiry;
- successful and failed payments;
- duplicate and out-of-order webhooks;
- customer-portal changes;
- refunds and the published refund policy.

The exact checkout product must be generated from [pricing.md](../product/pricing.md); this decision record deliberately contains no duplicated price.

## Alternatives Considered

- Plain Stripe Checkout/Billing: lower payment-rail cost, but not the selected Merchant of Record model.
- Paddle: mature Merchant of Record fallback.
- Creem, Dodo Payments, Polar, and Lemon Squeezy: possible alternatives if eligibility, payout, support, or economics become better for the launch shape.

Reopen this decision if Stripe Managed Payments rejects the use case, requires an impractical launch setup, changes the tax scope materially, or becomes uneconomic at sustained volume.

## Open Questions

- Confirm the company, country, and product eligibility requirements.
- Confirm exactly which taxes, refunds, disputes, invoices, and customer communications Stripe handles as Merchant of Record.
- Confirm current Irish payout timing and charges.
- Decide the revenue or operational threshold for comparing Merchant of Record cost with plain Stripe plus specialist tax tooling.

## Official Provider Links To Recheck

- [Stripe Managed Payments](https://docs.stripe.com/payments/managed-payments)
- [Stripe Ireland pricing](https://stripe.com/ie/pricing)
- [Stripe payouts](https://docs.stripe.com/payouts)
- [Creem payouts](https://docs.creem.io/merchant-of-record/finance/payouts)
- [Paddle pricing](https://www.paddle.com/pricing)
- [Paddle payouts](https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid)
- [Dodo Payments pricing](https://dodopayments.com/pricing)
- [Polar pricing](https://polar.sh/resources/pricing)
- [Lemon Squeezy fees](https://docs.lemonsqueezy.com/help/getting-started/fees)

Paid checkout remains gated by [launch-checklist.md](../product/launch-checklist.md).
