# Company Formation And Launch Admin

Status: planning checklist, not legal or tax advice.
Last verified against public Irish sources: 2026-06-15.

This doc records the company/admin order for OghmaNotes before paid launch. The practical rule is: building before incorporation is fine; taking meaningful public subscription revenue after incorporation is cleaner.

## Recommendation

Register the LTD before turning on serious paid subscriptions.

The app can continue moving through technical beta while the company setup is prepared, but paid launch should wait until the money path is company-owned: company, bank account, Stripe, expense tracking, and founder ownership records.

## Order Of Work

1. Draft founder agreement basics.
2. Check and agree company name.
3. Register the LTD with the CRO.
4. Set up company email/admin/password manager.
5. Move or record company assets.
6. Register with Revenue as needed.
7. File RBO beneficial ownership.
8. Open a business bank account.
9. Set up Stripe under the company.
10. Publish final terms, privacy, and refund policy.
11. Run free beta.
12. Launch paid subscriptions.
13. Do bookkeeping weekly.

## 1. Founder Basics First

Agree these before CRO forms:

- Company name, likely `OghmaNotes Limited`.
- Share split, currently expected as 50/50 if both founders agree.
- Directors, likely Semyon and Shrey.
- Company secretary, either one founder or an external formation/accountancy service.
- Registered office address.
- Ownership or assignment of current code, domain, designs, docs, and product assets.
- What happens if one founder leaves.
- Spending approval rules.
- Deadlock rules.
- Treatment of historical personal expenses.

This does not need to be a perfect long-form agreement before incorporation, but it must be clear enough that registration does not create a share or ownership dispute.

## 2. Register The Company

For an Irish LTD, CRO registration comes before the bank account because the bank will generally need the company details and company number.

The CRO says a company is formed by submitting Form A1 and a constitution through CORE. Form A1 includes the company name, registered office, directors, secretary, subscribers, and share details.

Source: https://cro.ie/registration/company/required-steps/

## 3. Set Up Company Admin

After incorporation, create the operational admin base:

- Company email inboxes.
- Shared password manager.
- GitHub organisation ownership.
- Domain ownership records.
- Cloudflare, Neon, Stripe, GPU, AI, and other billing ownership.
- Receipt, invoice, and contract storage.
- Bookkeeping sheet or accounting software.

Anything paid personally by a founder should be logged as either:

- Reimbursable founder expense.
- Director loan or amount owed by the company to the founder.

Avoid untracked personal payments once the company exists.

## 4. Revenue And Tax Setup

Revenue says every company incorporated or beginning trading in the State must give a Statement of Particulars to Revenue, using Form 11F CRO, within 30 days after the company begins trading.

Source: https://www.revenue.ie/en/companies-and-charities/corporation-tax-for-companies/company-statement-of-particulars/index.aspx

Likely tax heads:

| Tax Head | When |
|---|---|
| Corporation Tax | When the company begins trading |
| VAT | Only when needed or strategically sensible |
| PAYE/PRSI | When paying wages |

Do not blindly register every tax head before it is needed.

## 5. RBO Filing

After incorporation, file beneficial ownership with the RBO. The RBO says newly incorporated entities have 5 months from incorporation to register beneficial ownership.

For a 50/50 company, both founders are likely beneficial owners because the RBO threshold includes ownership or control above 25%.

Source: https://rbo.gov.ie/faqs/what-is-a-beneficial-owner-other-information/

## 6. Business Bank Account

Open a company bank account before paid launch.

Reasons:

- Stripe payouts should go to the company, not a personal account.
- Cloud, AI, GPU, and email expenses should be company expenses.
- Accounting stays cleaner.
- Founder money and company money stay separate.

Revolut Business, AIB, BOI, and similar options can work. The key requirement is a clean company-owned account before revenue starts.

## 7. Stripe Under The Company

Set Stripe up under the company after incorporation and bank setup:

- Stripe account in company name.
- Company bank payout account.
- Standard monthly subscription product.
- Free plan / paid plan gating.
- Tax/VAT settings.
- Receipts and invoices.
- Refund policy.
- Terms and privacy links.

Avoid launching paid subscriptions through a personal Stripe account if possible.

## 8. VAT Watchpoints

Revenue lists the Irish VAT threshold for services as EUR 42,500.

Source: https://www.revenue.ie/en/vat/vat-registration/who-should-register-for-vat/vat-thresholds.aspx

For cross-border EU B2C electronic/TBE services, Revenue documents a EUR 10,000 threshold. If that threshold is exceeded, VAT is due in the customer's Member State, and the supplier can register in each Member State or use OSS.

Source: https://www.revenue.ie/en/vat/vat-on-services/electronic-services/vat-and-electronically-supplied-services/index.aspx

This is one reason Stripe Managed Payments remains attractive for paid launch: it reduces the tax-admin burden if Oghma's product and account are accepted for that model.

## Paid Launch Minimum

Before public paid launch, aim to have:

- Company incorporated.
- Founder agreement drafted at least to core terms.
- Bank account open.
- Stripe under company control.
- Revenue/tax path understood.
- RBO filed or scheduled.
- Terms, privacy, and refund policy live.
- Expenses tracked.
- Company-owned admin access for domain, GitHub, Cloudflare, Neon, Stripe, GPU provider, and AI providers.

## Technical Beta

Free technical beta can happen before every company detail is perfect, as long as:

- User data protection and deletion/export flows are ready.
- Terms and privacy explain the beta clearly.
- No paid subscriptions are being taken personally.
- Any founder-paid infrastructure is tracked for later reimbursement or director-loan treatment.
