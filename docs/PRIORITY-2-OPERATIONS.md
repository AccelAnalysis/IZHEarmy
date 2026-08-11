# Priority 2 — Expanded Operations

The IZHE administrator dashboard supports the operational lifecycle after a customer pays or a Give One recipient redeems a code.

## Orders

The paid-order workspace continues to support search/filtering, order/item/history detail, direct-shipping tracking/provider fields, internal notes, CSV export, and protected church-pickup handoff.

Payment meaning is now a separate canonical domain beneath the order. The root order status is not used as the only source of truth for payment, refund, dispute, fulfillment, Give One, or support state. Payment facts retain actual Stripe totals in cents, including discount, shipping, tax, refunds, disputes, holds, net collected, and reconciliation state.

## Give One

Give One recipients continue to provide their own U.S. fulfillment address. Gift recipient fulfillment remains separate from paid church-order batch fulfillment.

New paid entitlements are represented by deterministic Give One obligations in `izhe-give-obligations`, while the public claim code remains human-friendly/random. Obligation states distinguish active, payment-review suspension, redeemed, in fulfillment, fulfilled, cancelled, and exception review.

A payment review suspends unused obligations rather than deleting them. Redeemed/fulfilled obligations remain historical facts after a later refund/dispute and create an exception/recovery condition when necessary.

## Fulfillment

Gift redemptions continue using the existing recipient fulfillment path. The deterministic Give One obligation is synchronized as the redemption moves from redeemed into fulfillment and fulfilled.

Paid church-pickup orders retain the distinct state machine `awaiting_batch → allocated → in_production → ready_for_pickup → picked_up`, with explicit exception/no-show/cancelled states. `ready_for_pickup` is intentionally not `ready_to_ship`.

## Production batches

Production batches retain their existing identity/vendor/status/due/tracking/reference/note/source-item/production-summary/history fields.

`campaign_church_pickup` batches additionally retain campaign and church destination snapshots. Batch receipt/completion sets linked paid pickup orders to `ready_for_pickup`; it is not proof of purchaser handoff.

The automatic pickup assembler now consults canonical payment/reversal state:

- only captured paid church-pickup orders qualify;
- fully refunded/cancelled orders are excluded;
- open disputes and ambiguous reversal allocations are excluded pending reconciliation;
- proven refunded whole units reduce the remaining editable source quantity;
- already allocated quantities remain protected from duplicate production;
- both the PR #14 source-item identity and canonical payment-line identity are retained.

Give One redemptions remain eligible only for their separate manual recipient-fulfillment batches.

## Pickup roster and handoff

The campaign pickup roster remains administrator-only/exportable and includes purchaser/pickup/item/fulfillment context needed for handoff. Only `ready_for_pickup` orders may normally be marked picked up. Duplicate handoff is rejected and corrective reversal requires an explicit note/history.

## Operational and reconciliation alerts

Existing aging/tracking/code/batch alerts remain. Church-pickup orders are not flagged for missing direct-shipping addresses.

Payment-integrity exceptions now also generate durable reconciliation tasks, including:

- unmatched Stripe refund/dispute events;
- partial refunds requiring allocation;
- open/lost disputes requiring review;
- failed resumable paid-order workflow stages;
- Give One mapping/state mismatch;
- post-production payment reversal/review.

After a pickup batch has been submitted or entered production, a later refund/dispute **does not remove the production history**. A critical reconciliation task preserves campaign, order, batch, quantity, source/payment-line identity, reversal amount, and status so any unrecoverable product cost can be resolved explicitly.

## Data stores and concurrency

Existing operational stores remain, supplemented by:

- `izhe-stripe-events` — durable privacy-minimized Stripe event receipts;
- `izhe-order-workflows` — resumable paid-order lease/stage records;
- `izhe-give-obligations` — deterministic gift obligations;
- `izhe-checkout-session-index`, `izhe-payment-index`, and `izhe-charge-index` — Stripe-to-order indexes;
- `izhe-reconciliation-tasks` / `izhe-reconciliation-history` — repair/review state;
- `izhe-mission-ledger-scopes` — serialized ledger scope revisions/leases.

Administrative mutations retain `IZHE_ADMIN_TOKEN` and ETag/conditional-write protections. Paid-order leases expire and recover; the former permanent one-shot fulfillment lock is no longer the current processing authority.

See [CHURCH-BATCH-FULFILLMENT.md](./CHURCH-BATCH-FULFILLMENT.md) for the pickup operating model and [PAYMENT-ACCOUNTABILITY-INTEGRITY.md](./PAYMENT-ACCOUNTABILITY-INTEGRITY.md) for financial/reconciliation authority.
