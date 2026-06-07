# Payment Processor Decision

> Last updated: 2026-06-07
> Current decision: Stripe Managed Payments for paid OghmaNotes subscriptions.

---

## Decision

Use **Stripe Managed Payments** as the first live payment processor for OghmaNotes.

This is specifically the Merchant of Record product, not plain Stripe Checkout. Plain Stripe is cheaper per transaction, but Oghma would remain responsible for transaction tax compliance. The current product requirement is to use a processor that manages transaction taxes for digital subscription sales.

Initial live product:

- Standard: EUR 10/month
- Premium: keep as a future tier until usage limits and paid demand are clearer
- University licence: manual sales path; revisit B2B invoicing separately

---

## Why Stripe Managed Payments

Stripe Managed Payments is the best fit for the expected launch shape:

- **Low early volume**: expected revenue may be closer to EUR 100/month than 100 users/month at first.
- **Good cashflow**: Stripe has low payout friction in Ireland, with normal payouts available without the high minimum withdrawal threshold and payout fees that hurt low-volume providers.
- **Merchant of Record**: Stripe Managed Payments handles the seller-of-record layer for supported digital products, including transaction tax handling.
- **Developer experience**: Stripe Checkout, Billing, customer portal, webhooks, test mode, dashboard logs, and SDKs are mature and well documented.
- **Switching cost control**: Stripe is close enough to the cheapest MoR option at EUR 10/month that maturity and payout terms matter more than saving a few cents per transaction.

Estimated EUR 10/month economics for Irish/EEA cards:

| Processor | Approx fee per user | Payout drag at EUR 100/mo | Practical early-stage read |
|---|---:|---:|---|
| Stripe Managed Payments | ~EUR 0.82 | ~EUR 0 normal payout fee | Best balance of MoR, tooling, and cashflow |
| Creem | ~EUR 0.79 | EUR 7 or 1% payout fee, plus EUR 50 minimum | Cheap transaction fee, worse below meaningful volume |
| Paddle | ~EUR 1.00 | EUR 100 minimum payout | Mature, but less friendly for tiny launch volume |
| Dodo Payments | ~EUR 1.00 | USD 50 minimum, small-payout fee below USD 1000 | Interesting fallback, less proven |
| Polar | ~EUR 1.15 | Low threshold, but higher transaction drag | Dev-friendly, not cheapest at EUR 10 |
| Lemon Squeezy | ~EUR 1.20 | USD 50 minimum and slower payout timing | Works, but not compelling for this app |

The key deciding point was Creem's payout structure. At EUR 100/month revenue, Creem's lower transaction fee is outweighed by the EUR 7 minimum payout fee. Stripe Managed is slightly more expensive per payment but materially better for low-volume cashflow.

---

## Alternatives

### Creem

Good future option if transaction volume grows enough that payout fees no longer matter. Creem is cheap and acts as Merchant of Record, but it is a newer/smaller platform. It should be reconsidered only after:

- Oghma consistently exceeds low-volume launch revenue
- the support/review/webhook experience is known to be reliable
- payout fees are amortised across enough monthly revenue

Watch policy wording: Oghma should be positioned as study notes, Canvas import, search, quizzes, and flashcards. Avoid any "do my homework" positioning because education-assistance policies can be sensitive.

### Paddle

Best mature fallback if Stripe Managed Payments is unavailable, rejected, or too limiting. Paddle is built for SaaS Merchant of Record subscriptions, but its EUR 100 minimum payout and higher fee make it less attractive for the first paid users.

### Dodo Payments

Possible future low-cost MoR alternative. Keep it on the watchlist, but do not lead with it while the company and platform maturity are less proven.

### Polar

Good developer-oriented MoR product, but no longer the preferred launch choice. The current published fee structure is materially worse than Stripe Managed at EUR 10/month, especially if international-card extras apply.

### Lemon Squeezy

Not recommended for this app. It is a valid MoR for digital products, but the fee stack for EU subscriptions is not competitive enough to justify choosing it over Stripe Managed or Paddle.

### Plain Stripe Checkout/Billing

Not the current decision. It is the cheapest payment rail, but it does not provide the Merchant of Record/tax-managed setup required for launch.

---

## Implementation Notes

Keep the local billing model provider-agnostic enough to switch later:

- `billing_provider`
- `provider_customer_id`
- `provider_subscription_id`
- `plan`
- `billing_status`
- `current_period_end`

Gate paid app features from Oghma's database state, not from live Stripe API calls on every request. Stripe webhooks should update local billing state.

Initial webhook coverage:

- checkout completed
- subscription created/updated/deleted
- invoice/payment succeeded
- invoice/payment failed

Initial UI:

- `/pricing` checkout button for Standard
- settings billing link to Stripe customer portal
- admin/manual fallback through the Stripe dashboard while volume is low

---

## Sources To Recheck Before Build

- Stripe Managed Payments: https://docs.stripe.com/payments/managed-payments
- Stripe Ireland pricing: https://stripe.com/ie/pricing
- Stripe payouts: https://docs.stripe.com/payouts
- Creem payouts: https://docs.creem.io/merchant-of-record/finance/payouts
- Paddle pricing: https://www.paddle.com/pricing
- Paddle payouts: https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid
- Polar pricing: https://polar.sh/resources/pricing
- Dodo Payments pricing: https://dodopayments.com/pricing
- Lemon Squeezy fees: https://docs.lemonsqueezy.com/help/getting-started/fees
