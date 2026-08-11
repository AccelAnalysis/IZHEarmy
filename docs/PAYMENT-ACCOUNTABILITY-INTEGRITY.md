# Payment & Mission Accountability Integrity

This document governs the IZHE payment-integrity, Give One obligation, refund/dispute, mission-support, reconciliation, and reporting implementation introduced by the `fix/payment-accountability-integrity` branch.

The purpose of this pass is financial truthfulness and recoverability. It does **not** redesign the storefront, change product prices, replace church-batch fulfillment, add Stripe Connect, automate church payouts, or create a full accounting general ledger.

## 1. Source-of-truth hierarchy

When records disagree, use this authority order:

1. **Verified Stripe facts** — Checkout Session, Payment Intent, Charge, Refund, Dispute, and balance transaction facts when available.
2. **Immutable Checkout and paid-order snapshots** — what merchandise, variants, quantities, eligibility, campaign, and fulfillment mode were sold.
3. **Immutable campaign support-policy snapshot** — the formula and eligibility basis that applied when Checkout was created.
4. **Deterministic Give One obligations** — one durable obligation identity for each eligible paid/gift unit combination.
5. **Append-only mission ledger** — human-authorized support payments, adjustments, costs, reversals, notes, and settlement records.
6. **Production and fulfillment history** — manufacturing, shipment, church pickup, recipient fulfillment, and exception facts.
7. **Current catalog/campaign data** — display fallback only; never the historical financial authority.

A current catalog price must never rewrite a historical sale. A current support rate must never rewrite an earlier paid order. A manual note cannot override a verified Stripe payment/refund/dispute fact.

## 2. Payment, refund, and dispute state model

Payment meaning is separate from commerce-order and fulfillment meaning. The canonical order payment record is nested beneath `order.payment` and retains integer cents only.

### Capture state

- `pending`
- `paid`
- `failed`
- `cancelled`

### Refund state

- `none`
- `partial`
- `full`
- `allocation_required`

### Dispute state

- `none`
- `open`
- `won`
- `lost`
- `reinstated`
- `review_required`

### Reconciliation state

- `reconciled`
- `legacy_reconciled`
- `legacy_unreconciled`
- `stripe_backfill_available`
- `stripe_reference_missing`
- `event_unmatched`
- `allocation_required`
- `index_repair_required`
- `manual_review_required`

The root operational order status remains for backward compatibility, but it is not the financial source of truth. A single order may simultaneously be paid, partially refunded, in production, associated with an open dispute, holding mission support, and carrying both fulfilled and suspended Give One obligations.

### Canonical amount definitions

All values are integer cents.

```text
merchandiseNetBeforeRefunds
= merchandiseGross - discountTotal

netCollected
= totalCharged
  - completed refunds
  - final lost-dispute amounts not already represented by those refunds

availableAfterHolds
= netCollected - unresolved held amounts
```

The model separates:

- merchandise gross;
- discount;
- merchandise net before refunds;
- shipping and tax collected;
- total charged;
- merchandise/shipping/tax/unallocated refund components;
- cumulative total refunded;
- open dispute amount;
- final dispute loss;
- reinstated dispute amount;
- net collected;
- amount held;
- amount available after holds;
- actual processor fee and verified net deposit when a Stripe balance transaction supplies those facts.

No generic Stripe processing percentage is used to invent an order's actual processor fee. Stripe Tax service fees that are not transaction-level payment facts remain operating costs rather than estimated order facts.

## 3. Stripe event-receipt lifecycle

Verified webhook events are recorded in `izhe-stripe-events`, keyed by immutable Stripe event ID.

The webhook sequence is:

1. Read the raw request body.
2. Verify the Stripe signature using `STRIPE_WEBHOOK_SECRET`.
3. Create or load the privacy-minimized event receipt.
4. If the receipt is already `processed` or `ignored_supported_noop`, acknowledge without replaying effects.
5. Mark the event `processing` and increment its attempt count.
6. Run the required resumable business workflow.
7. Link the receipt to the resolved local order when known.
8. Mark it `processed`, or retain it as `failed_retryable` / `reconciliation_required`.
9. Return non-2xx when a required side effect has not completed.

Receipt fields include event ID/type/time, livemode, relevant Stripe object IDs, local order link, processing stage/state, attempt timestamps/counts, safe error summary, reconciliation state, a SHA-256 payload digest, and build/deploy identity when exposed by the environment.

The full raw Stripe object is **not** stored in this receipt. Billing addresses, card/payment-method details, and unnecessary customer PII are intentionally excluded.

Unmatched refunds and disputes are not acknowledged as completed work. The verified event remains durable and a reconciliation task is opened so a later index/order repair can resolve the event without deleting history.

## 4. Resumable paid-order fulfillment

Paid Checkout processing uses `izhe-order-workflows` rather than the former permanent `onlyIfNew` lock.

Each workflow carries:

- owner/attempt UUID;
- acquired and heartbeat timestamps;
- finite lease expiration;
- current and last completed stage;
- attempt and recovery counts;
- last safe error.

The stage sequence is:

1. `payment_verified`
2. `checkout_draft_resolved`
3. `order_initialized`
4. `line_settlement_saved`
5. `give_one_obligations_ensured`
6. `order_finalized`
7. `payment_indexes_ensured`
8. `accountability_projection_ensured`
9. `event_completed`

An active lease prevents unsafe concurrent fulfillment. An expired lease can be recovered. A failed invocation retains completed records and stage state; it does not delete the order or completed gift history.

An existing paid order is not returned immediately. The workflow rechecks/repairs the required invariants: Checkout Session index, Payment Intent index, Charge indexes, Stripe event links, canonical payment/line settlement, expected Give One obligations, public-code mappings, campaign attribution, fulfillment snapshot, and accountability projection.

## 5. Discount-allocation method

Historical merchandise revenue is based on the authoritative Checkout settlement, not `catalog unit price × quantity` after the fact.

When Stripe line items expose authoritative `amount_discount` values whose sum equals the order discount, those values are retained.

When only an order-level merchandise discount can be used, the system applies `gross-largest-remainder-v1`:

1. Calculate each line's gross merchandise basis in cents.
2. Allocate the order discount proportionally to those bases.
3. Take integer-cent floors.
4. Rank remainders deterministically by remainder and stable line identity.
5. Distribute remaining cents until allocations sum exactly to the verified order discount.

Shipping and tax are not treated as merchandise discount unless Stripe explicitly represents them that way. The allocation method/version is persisted with the line settlement so retries produce the same result.

## 6. Refund-allocation method

Stripe is authoritative for the cumulative refund amount. Local allocation determines what that verified cash reversal means operationally.

The system may allocate automatically only when the effect is objectively provable, including:

- a verified full-order refund;
- an approved, stored administrative allocation;
- a future Stripe representation that directly provides trustworthy line/component allocation;
- another deterministic case explicitly implemented and tested.

A full-order refund allocates remaining merchandise, shipping, and tax components and records all whole-unit reversals that are objectively implied.

Administrative refund allocation is append-only. A protected administrator may assign a verified refund to:

- immutable merchandise line amounts;
- selected whole units, when the allocated amount covers each selected unit's complete settled merchandise value;
- shipping;
- tax;
- an unallocated remainder while review remains open.

Validation prevents allocation above the verified cumulative Stripe refund, the remaining line value, remaining shipping, or remaining tax. Each allocation records refund ID, note, effective time, actor `admin-token`, and order revision. A correction is a new reversal/reallocation record; history is never silently edited.

## 7. Ambiguous-refund policy

A partial refund that cannot be proven against merchandise/shipping/tax/whole units is **not guessed**.

The system:

- stores the actual cumulative Stripe refund immediately;
- sets `allocation_required`;
- stores `refundUnallocated`;
- opens a reconciliation task;
- holds potentially affected support;
- suspends unused Give One obligations instead of cancelling them irreversibly;
- preserves redeemed/in-fulfillment/fulfilled obligations and records an exception when the source funding later becomes insufficient;
- prevents a final-reconciled campaign presentation while the allocation remains unresolved.

Shipping-only and tax-only allocations do not cancel a merchandise-funded Give One obligation.

## 8. Dispute hold/release policy

Disputes are separate from refunds.

### Open

An open dispute preserves the original paid history, records the disputed amount, places mission support on hold, suspends unused Give One obligations, opens an operational/reconciliation alert, and blocks final settlement.

### Won / funds reinstated

When Stripe reports restored funds, the dispute history remains. Applicable support holds are released and eligible unused obligations are reactivated. Existing obligations are not recreated.

### Lost

A final loss becomes a payment reversal. A full loss may cancel corresponding unused obligations. A partial loss whose line/component effect cannot be proven remains `allocation_required`; unused obligations remain suspended until reconciliation. Redeemed, fulfilled, or production-committed history is retained and a recovery/exception condition is created where necessary.

Refund and dispute amounts are not simply added together when they represent the same reversed funds. `netCollected` uses final lost-dispute amounts only to the extent they are not already represented by completed refunds.

## 9. Give One obligation identity and status model

Business obligations are stored in `izhe-give-obligations`. The human-facing claim code remains random, but the obligation identity is deterministic:

```text
<checkout-session-id>:<stable-line-id>:paid:<paid-unit-index>:gift:<gift-unit-index>
```

This supports one or multiple gift units per eligible paid unit without duplicate issuance on webhook replay.

Each obligation stores source Checkout Session, Payment Intent, order, line, paid/gift unit indexes, immutable product/variant/campaign snapshots, policy version, public code, status/history, redemption/fulfillment IDs, batch references, payment-review reason, cancellation reason, and exception state.

Statuses are:

- `active`
- `suspended_payment_review`
- `redeemed`
- `in_fulfillment`
- `fulfilled`
- `cancelled`
- `exception_review`

Retries calculate the expected deterministic identity set, create only missing obligations, repair missing code mappings, and verify the expected count. Existing legacy public codes are wrapped rather than reissued.

Recipients continue using the individual-address Give One redemption path. Paid church-pickup batches do not automatically absorb Give One redemptions.

## 10. Support eligibility

`supportEligible` is explicit catalog data and is copied into the Checkout/order snapshot.

For the bounded existing-catalog migration:

- existing approved Give One apparel/shirt products are seeded `supportEligible: true`;
- the physical book is seeded `supportEligible: false`;
- other products default to false unless explicitly configured;
- new products require an administrator eligibility choice.

This migration rule is a catalog default only. Paid historical orders are not rewritten from today's catalog.

Give One eligibility and support eligibility are distinct concepts even when an existing shirt happens to be eligible for both.

## 11. Versioned campaign-support policy

Campaign support policy is snapshotted at Checkout creation. A policy contains campaign ID, policy ID/version, model/rate/currency, explicit eligibility bases, calculation version, effective time, creator/source, and lock time.

Before qualifying commerce begins, an administrator can update the active formula in place. Once qualifying support-eligible paid commerce exists, the prior policy is locked and a changed formula becomes a **prospective new version**. Existing paid orders continue using their earlier snapshot.

For fixed support, the campaign amount accrues once per policy version after qualifying settled activity; it does not accrue once per order.

## 12. Support calculation formulas

### Percentage

```text
supportCalculated
= percentage × net recognized support-eligible merchandise revenue
```

The basis is after allocated merchandise discounts and allocated merchandise refunds. Shipping, tax, non-support-eligible merchandise, and final payment reversals are excluded. Unresolved amounts create holds rather than a false final number.

### Per unit

```text
supportCalculated
= per-unit rate × settled whole support-eligible units
```

Books/noneligible items do not count. Proven fully refunded units do not count. A dollar-only partial refund does not become a fractional unit by guess.

### Fixed

The fixed amount is zero until at least one qualifying support-eligible paid order exists. It accrues once for the policy after qualifying settled activity. If all qualifying commerce is later reversed, the support amount is removed/held as appropriate while previously recorded support payments remain historical facts.

### Support balances

```text
supportAccrued
= supportCalculated + signed supportAdjustments

supportAvailable
= max(0, supportAccrued - supportHeld)

supportOutstanding
= max(0, supportAvailable - supportPaid)

supportOverpaid
= max(0, supportPaid - supportAvailable)
```

Overpayment is reported as a recovery condition; it is not hidden by forcing outstanding to zero.

## 13. Ledger authority and concurrency behavior

`izhe-mission-ledger` remains append-only. New records include stable entry ID, idempotency key, type, campaign, cents/currency, effective/created time, source/event/related order/payment/settlement/policy references, actor, human reference/note, and reversal target when applicable.

New Stripe refunds are **not** manual `refund_adjustment` entries. Stripe reversals live in canonical payment records; support/accountability consumes those facts directly. Legacy `refund_adjustment` records remain readable for compatibility but the current validator does not create new ones.

Writes are serialized by an expiring campaign/organization scope in `izhe-mission-ledger-scopes`. Within that lease the server:

1. reloads the current ledger/accountability state;
2. rejects duplicate idempotency keys;
3. validates payment/reversal/cost limits;
4. appends the immutable ledger entry;
5. advances the scope revision;
6. releases the lease.

This prevents two concurrent support payments from both validating against the same outstanding balance. References remain a secondary duplicate-warning mechanism.

Until named administrator accounts exist, the actor is explicitly `admin-token`.

## 14. Reconciliation workflow

`admin-reconcile-payment` exposes a protected order-level **Reconcile with Stripe** operation.

Dry-run mode retrieves/compares:

- Checkout Session and line items;
- Payment Intent;
- Charges;
- cumulative Refunds;
- Disputes;
- balance transaction fee/net facts when available;
- local canonical payment and line settlements;
- Checkout Session / Payment Intent / Charge indexes;
- expected Give One obligation identities and public-code mappings;
- Stripe event receipts and their order links;
- campaign attribution.

It returns human-readable differences plus a machine-readable repair plan.

Apply mode requires a fresh order revision timestamp. It may repair local IZHE payment facts, indexes, event links, line settlements, and missing obligations/mappings. It may **not** issue/refund/capture/cancel a Stripe payment or mutate Stripe Products, Prices, customers, coupons, promotions, shipping rates, or configuration.

Reconciliation history is appended rather than silently overwritten.

The administrator queue includes unmatched events, refund allocation, open/lost disputes, failed paid-order workflows, missing/index review, Give One mismatches, support overpayment, post-production reversals, and other manual-review conditions.

## 15. Legacy-data treatment

No production-wide destructive migration is part of this implementation.

`admin-payment-migration-report` is dry-run inspection only. It classifies legacy orders as reconciled, Stripe-backfill-capable, Stripe-reference-missing, or manual-review-required; checks payment/session indexes; identifies old one-shot lock records; and reports whether deterministic wrappers/line settlements/policy snapshots are absent.

Rules:

- preserve original top-level fields;
- add canonical fields only through bounded reconciliation/normalization;
- reconcile from Stripe when stable Session/Payment Intent references exist;
- never use today's catalog price as proof of an old payment;
- never claim an old discount/refund allocation is exact without evidence;
- preserve existing Give One codes and wrap rather than reissue them;
- repair indexes locally when safely provable;
- do not delete old lock history as part of the dry-run audit.

Legacy history for which the original Stripe event receipt never existed cannot be retroactively represented as if the webhook receipt had been captured at event time.

## 16. Production-batch reversal behavior

Before an editable church batch is submitted, the assembler uses canonical payment state:

- only paid church-pickup orders qualify;
- fully refunded/cancelled orders are excluded;
- open disputes and ambiguous reversal allocations are excluded;
- proven refunded whole units are removed from remaining source quantities;
- exact source-item and payment-line identities are retained;
- already allocated quantities remain protected against duplication.

After a batch is submitted/enters production, a later refund/dispute does not delete the batch or rewrite production history. A critical reconciliation task retains campaign, order, batch, quantity, payment-line/source-item, reversal amount, and status. Any unrecoverable product cost is resolved administratively rather than hidden.

Batch receipt/completion still means production arrived at the church, not that the purchaser completed pickup.

## 17. Public accountability definitions

Public campaign accountability is privacy-minimized. It may show:

- net eligible merchandise activity;
- support calculated/accrued;
- support paid;
- support outstanding;
- gifts fulfilled;
- open gift obligations;
- a concise under-reconciliation state.

It does not expose purchaser identity/contact/address, Stripe customer/payment/refund/dispute IDs, pickup codes, full internal order references, internal notes, vendor cost detail, or operational alerts.

`supportPaid` is displayed only from append-only support-payment ledger entries. Calculated/accrued support is not labelled paid.

If a material refund allocation, open dispute, unmatched event, legacy proof gap, or gift exception prevents a defensible final figure, the public API returns provisional financial figures as `null` and the page displays **Figures under reconciliation** rather than false precision.

## 18. Required Stripe webhook subscriptions

The implementation recognizes the following event families under the repository's installed Stripe SDK/API behavior:

### Checkout

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

### Refunds

- `charge.refunded`
- `refund.created`
- `refund.updated`
- `refund.failed`

### Disputes

- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `charge.dispute.funds_reinstated`
- `charge.dispute.funds_withdrawn`

A valid unrelated event is retained as an explicit supported no-op receipt rather than being confused with a processing failure.

Before production release, confirm the production Stripe webhook endpoint is actually subscribed to these event names. Do not change live webhook configuration during code review/testing unless separately authorized.

## 19. Required environment variables

Payment/accountability functions rely on the repository's existing environment model:

- `STRIPE_SECRET_KEY` — Stripe API key; use a test key for manual acceptance.
- `STRIPE_WEBHOOK_SECRET` — signing secret for the exact webhook endpoint/environment.
- `IZHE_ADMIN_TOKEN` — existing administrator protection until named accounts/RBAC are implemented.
- `URL` or `SITE_URL` — canonical site/deploy URL used by Checkout redirects.
- `STRIPE_STANDARD_SHIPPING_RATE_ID` — existing direct-shipping rate when configured.
- `IZHE_SHIPPING_CENTS` — existing fallback direct-shipping amount where the implementation already permits it.

Build/deploy identity (`COMMIT_REF` / `DEPLOY_ID`) is recorded in event receipts when the host supplies it.

Secrets must remain server-side and outside source control. Browser payloads never receive secret keys/webhook secrets/admin tokens from these functions.

## 20. Stripe test-mode acceptance procedure

Use a local Netlify environment or isolated deploy preview with **Stripe test mode only**. Do not use production customer records.

Record event IDs, Session IDs, Payment Intent IDs, Refund/Dispute IDs where applicable, expected/actual cents, pass/fail result, and privacy-safe evidence for:

1. Direct-shipping paid order without discount.
2. Direct-shipping order with promotion code.
3. Church-pickup paid order.
4. Completed webhook replay.
5. Forced failure after order initialization, after a partial Give One set, and after final order write before indexes.
6. Proven partial merchandise/unit refund before batching.
7. Ambiguous partial refund.
8. Shipping-only refund.
9. Full refund before batching.
10. Refund after batch submission.
11. Refund after Give One redemption.
12. Dispute open → funds restored/won → final loss where test helpers permit.
13. Missing-index reconciliation dry-run/apply repair.
14. Administrator/public reports and CSV agreement.

Acceptance is not considered complete merely because unit tests pass.

## 21. Production release checklist

Before production deployment:

- [ ] Exact PR head passes the full repository suite and all syntax checks.
- [ ] Stripe test-mode manual acceptance above is recorded in the PR.
- [ ] No unresolved critical reconciliation defect remains from test acceptance.
- [ ] Production `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are present only in server environment configuration.
- [ ] Production webhook subscriptions include all required Checkout/refund/dispute lifecycle events.
- [ ] Production URL/shipping configuration remains the intended existing configuration.
- [ ] `IZHE_ADMIN_TOKEN` is present and protected.
- [ ] No production-wide migration is run automatically.
- [ ] Legacy migration/reconciliation report is reviewed before any later backfill.
- [ ] Netlify Blob stores used by this pass are available in the target environment.
- [ ] Public campaign pages are checked for privacy and under-reconciliation behavior.
- [ ] Accountability CSV cent values are sampled against Stripe test evidence.
- [ ] Church-batch regression and post-production reversal handling are reviewed.
- [ ] Give One redemption remains individual-address fulfillment.
- [ ] Deployment is separately authorized; this implementation PR itself does not deploy or merge.

## 22. Known limitations and deferred governance

This pass intentionally does not add named administrator identities, RBAC, MFA, formal separation of duties, reporting-period locks, a platform-wide audit product, customer accounts, automated payouts, Stripe Connect, or a full accounting general ledger.

Other limitations:

- Historical events that predate event-receipt storage cannot be given an authentic original receipt timestamp retroactively.
- Legacy orders without a stable Stripe reference remain `manual_review_required` rather than being reconstructed from current catalog data.
- A partial final dispute whose merchandise/component effect is not objectively known remains an allocation/reconciliation condition; it is not guessed.
- Actual Stripe processor fee/net deposit is nullable when a balance transaction is unavailable or not expanded/authorized.
- Refund allocation is currently an administrator workflow; customers do not allocate their own refunds.
- The current administrator actor remains `admin-token`; it must not be presented as a named human audit identity.
- Public under-reconciliation disclosure is intentionally concise and does not expose the private reason/details.
- Production readiness additionally depends on Stripe test-mode manual acceptance and production configuration verification; code/CI completion alone is not production completion.
