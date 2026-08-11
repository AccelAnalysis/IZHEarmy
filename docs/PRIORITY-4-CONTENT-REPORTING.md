# Priority 4 — Content, Teaching, and Mission Accountability

This implementation covers the approved Priority 4 areas:

1. Structured website content
2. Book and teaching resources
3. Financial and mission-accountability reporting

Named administrator accounts, roles and permissions, MFA, separation of duties, reporting-period locks, and a platform-wide audit-history system remain deferred. The existing `IZHE_ADMIN_TOKEN` protects administrative functions during this phase.

## Structured website content

Website content is stored in the `izhe-content` Netlify Blobs store as versioned, structured records rather than free-form HTML.

Initial content sections are:

- Site SEO and social-sharing metadata
- Home hero
- Home story
- Home book feature
- Give One section
- Churches and ministries section
- Site announcement

Each record supports draft/review/approval/scheduling/publication lifecycle, section-specific fields, revision numbers, conditional writes, and administrator preview. The public site loads published content through `public-content`; static HTML remains the safe fallback if the content service is unavailable.

## Book and teaching resources

Teaching content is stored in `izhe-teaching` and includes books, chapters, and resources. The seeded library includes *Who Is God to You? — Discovering God Through His Names*, the twelve Collection 1 chapters, core Scriptures/questions, and a public Collection 1 teaching overview.

Book/chapter/resource records preserve their existing governed fields, relationships, publication lifecycle, resource types, and access values. Until named accounts/permissions exist, only public resources are delivered by the public teaching endpoint at `/learn/`.

## Financial and mission accountability

Financial reporting no longer treats root order status, current catalog price, or a whole-order reversal assumption as sufficient authority.

The source-of-truth order is:

1. Verified Stripe payment/refund/dispute facts.
2. Immutable Checkout and paid-order line snapshots.
3. Immutable campaign support-policy snapshots.
4. Deterministic Give One obligations.
5. Append-only mission ledger entries.
6. Production and fulfillment records.
7. Current catalog/campaign data only as nonfinancial display fallback.

The canonical payment model separates merchandise gross, discounts, net merchandise before refunds, shipping/tax, total charged, actual cumulative refunds, refund allocation, disputes, net collected, held amounts, and verified processor fee/net-deposit data when available.

Accountability separates:

- gross merchandise;
- discounts;
- net merchandise before refunds;
- merchandise/shipping/tax refunds;
- total charged/refunded;
- open/final dispute amounts;
- net collected and payment holds;
- support calculated, adjusted, held, accrued, available, paid, outstanding, overpaid, and recovery required;
- Give One obligations by active/suspended/redeemed/in-fulfillment/fulfilled/cancelled/exception state;
- production and pickup measures;
- explicit reconciliation counts.

A partial refund is reported at the actual verified Stripe amount. It is not converted to the full order total. A discount reduces recognized merchandise revenue through deterministic line allocation. Shipping/tax are excluded from merchandise support basis. Support eligibility is explicit in the paid-order snapshot.

Campaign support uses the policy version that applied when Checkout was created. Percentage support uses net recognized support-eligible merchandise. Per-unit support uses settled whole support-eligible units. Fixed support remains zero until qualifying commerce exists and accrues once per policy version rather than once per order.

## Append-only mission ledger

Ledger entries are stored individually in `izhe-mission-ledger`. Existing entries cannot be edited/deleted through the dashboard; corrections are new reversal/adjustment records.

Current entry types are:

- Support adjustment
- Support payment
- Payment reversal
- Campaign cost
- Cost reversal
- Accountability note
- Campaign settlement

New Stripe refund facts are **not** duplicated as discretionary `refund_adjustment` ledger entries. Legacy entries of that old type remain readable for compatibility but the current validator does not create them.

New records include an idempotency key, cents/currency, source/actor, effective/created times, campaign and related-record references, note/reference, and reversal linkage when applicable. The current actor is explicitly `admin-token`.

Campaign/organization scope leases and revisions serialize balance validation and append so concurrent support payments or reversals cannot collectively exceed the available/reversible amount after both race against the same pre-write state.

## Reconciliation and administrator reporting

The Accountability workspace retains organization/campaign reporting and adds payment-integrity detail and a reconciliation queue. Administrators can inspect payment/refund/dispute/reconciliation states, canonical cents, immutable line settlement, status timeline, support holds/overpayments, and payment exceptions.

`Reconcile with Stripe` supports dry-run comparison followed by explicit local apply with order revision protection. It may repair local payment facts, indexes, event links, line settlement, and missing Give One obligations/mappings; it does not mutate Stripe.

Refund allocation is protected and append-only. Ambiguous partial refunds remain allocation-required, place affected support on hold, and suspend unused gift obligations rather than guessing.

Administrator CSV exports include stable source-cent fields plus formatted dollar values for campaigns/orders and an expanded append-only ledger export.

## Public accountability

Published campaign pages expose only privacy-safe accountability concepts. Support is never labelled paid unless a support-payment ledger entry proves it.

When payment/refund/dispute/Give One records are materially unresolved, provisional financial values are withheld and the public campaign shows **Figures under reconciliation** instead of a false exact final number. Customer identity/contact/address, Stripe IDs, internal notes, pickup codes, vendor costs, and administrative alerts remain private.

## Further authority

See [PAYMENT-ACCOUNTABILITY-INTEGRITY.md](./PAYMENT-ACCOUNTABILITY-INTEGRITY.md) for the canonical payment model, event receipt lifecycle, discount/refund allocation, dispute behavior, deterministic Give One identity, support-policy versioning, reconciliation, legacy treatment, webhook subscriptions, test-mode acceptance, and production release checklist.
