# Church Batch Fulfillment

This document governs the bounded church-pickup fulfillment capability for IZHE campaigns. It extends the existing campaign, Stripe Checkout, order, Give One, production-batch, and administrator workflows without creating a second commerce platform.

Financial/reversal authority is governed by [PAYMENT-ACCOUNTABILITY-INTEGRITY.md](./PAYMENT-ACCOUNTABILITY-INTEGRITY.md). This document governs the physical/pickup consequence of those verified payment states.

## Fulfillment definitions

### `individual_shipping`

The direct-to-customer path. Stripe Checkout collects a U.S. shipping address, applies the configured standard shipping rate, keeps automatic tax enabled, and the order follows the shipping-oriented lifecycle. These orders are never automatically included in a campaign church-pickup batch.

### `church_batch`

The checkout is consolidated with other paid campaign pickup orders and delivered to the participating church/ministry. The purchaser does not provide an individual shipping address and does not pay the normal per-order direct-shipping charge. Stripe Checkout requires billing information for tax calculation. The paid order stores an immutable pickup-location promise and human-readable pickup confirmation code. After the church receives production, the purchaser order becomes `ready_for_pickup` until handoff is recorded.

### `hybrid`

The campaign supports both modes. The purchaser explicitly chooses church pickup or direct shipping before Checkout. One Checkout Session has one fulfillment mode; mixed pickup/shipping carts are intentionally unsupported. The server validates the requested mode against the campaign.

## Campaign pickup configuration

`church_batch` and `hybrid` campaigns use structured `churchBatch` fields for pickup location/address, public/internal instructions, estimated ready time, pickup window, and administrator-only contact details.

Pickup location name, address line 1, city, two-letter state, ZIP, and public instructions are required before a published scheduled/active pickup campaign can accept orders. Invalid states/ZIPs/emails/dates are rejected server-side. Existing individual-shipping campaigns remain compatible without pickup configuration.

## Public campaign experience

The public API exposes only sanitized fulfillment information: allowed mode, readiness, pickup location/address, public instructions, estimated-ready date, and pickup-window dates. Internal instructions/contact details remain private.

Church-pickup purchasers are told before Checkout that the order travels with the consolidated campaign order and does not carry the normal individual-shipping charge. Hybrid campaigns require explicit mode selection and the server revalidates it.

## Stripe Checkout differences

All paths retain server-side catalog validation, Stripe lookup-key/amount verification, phone collection, customer creation, invoices, promotions, and automatic tax.

For `individual_shipping`, U.S. shipping collection and the existing configured shipping rate/fallback remain.

For `church_batch`:

- `shipping_address_collection` is omitted;
- direct-shipping `shipping_options` are omitted;
- normal per-order shipping is not applied;
- billing address collection is required;
- automatic tax remains enabled;
- Checkout copy describes church/campaign pickup;
- the full pickup snapshot stays in the server-side Checkout draft rather than Stripe metadata.

### Tax review caveat

The application does not invent pickup tax sourcing rules. Live tax treatment must be reviewed with a qualified tax professional before unrestricted production use.

## Checkout draft and immutable paid-order snapshot

The Checkout draft stores the server-resolved fulfillment mode, campaign attribution, product/variant snapshot, explicit support/Give One eligibility, active support-policy version, pickup/direct-shipping promise, and pickup code when applicable.

Paid orders store canonical Stripe settlement facts in integer cents. These include merchandise gross, allocated discount, merchandise net before refund, shipping, tax, total charged, later verified refunds/disputes, and reconciliation state. Historical confirmation/accountability pages use the immutable order settlement rather than current catalog/campaign price fields.

For church pickup, the stored shipping collected amount is zero unless Stripe itself proves otherwise; it is never inferred from the general storefront shipping configuration.

## Paid-order lifecycle

Church pickup retains its physical state machine:

1. paid order → `awaiting_batch`;
2. batch ready/submitted → `allocated`;
3. batch in production → `in_production`;
4. batch received/completed → `ready_for_pickup`;
5. handoff → nested `picked_up`, root operational completion;
6. explicit exception/no-show/cancelled states as needed.

These states do not replace `order.payment.captureStatus`, `refundStatus`, `disputeStatus`, or `reconciliationStatus`. A production status is not proof that payment is unreversed, and a payment reversal does not erase production history.

## Build or Refresh Church Pickup Batch

The administrator campaign action is server-authoritative and reads canonical payment/line settlement state.

A source order qualifies only when it:

- belongs to the selected campaign;
- has saved fulfillment mode `church_batch`;
- has captured paid status;
- is not cancelled;
- is not fully refunded;
- has no open dispute or unresolved payment/reversal allocation that should block production.

The assembler excludes direct-shipping hybrid orders, general-storefront orders, Give One redemptions, and quantities already allocated to another active batch.

For a proven whole-unit refund, only the objectively reversed units are removed from remaining editable batch quantity. A dollar-only/ambiguous partial refund is not translated into guessed units; the order remains out of production until reconciliation.

Each source item retains the original PR #14 structural source-item identity plus the canonical immutable payment-line identity. Product/variant/fit/size/color/SKU snapshots remain historical.

Editable `draft`/`ready` batches refresh with ETag protection. Once `submitted`, `in_production`, `received`, `completed`, or `cancelled`, automatic assembly does not rewrite that batch. Later eligible orders create supplemental batches.

## Production destination and receipt

Church-pickup batches retain batch/campaign/destination/vendor/due/tracking/submitted/received/internal-note/production-summary/source-line history. The lifecycle remains `draft → ready → submitted → in_production → received → completed`, with explicit cancellation.

`received`/`completed` means the production shipment reached the church, not that each purchaser picked up an order.

## Pickup handoff and roster

Operations search continues to find pickup orders by purchaser or pickup/order reference. The protected handoff endpoint records released-by, recipient name, note, timestamp, exception/no-show detail, and corrective history. Only `ready_for_pickup` may normally be marked picked up; duplicate handoff is rejected.

The administrator-only roster retains campaign/pickup/order/purchaser/item/amount/fulfillment/batch/pickup-window/handoff fields and CSV output.

## Campaign operational metrics

Administrator metrics distinguish paid pickup orders/units, unbatched/batched/in-production units, ready/picked-up/exception orders, and hybrid direct-shipping orders. Give One obligations are deliberately not mixed into these paid-order church-pickup counts.

## Refund and dispute reconciliation

### Before batch submission

Draft/ready assembly uses canonical payment state. It excludes full reversals, open disputes, and ambiguous partial reversals; known whole-unit refunds reduce only the affected quantity.

### After submission / production commitment

A refund/dispute does **not** silently remove source history or rewrite the production obligation. The payment-event processor creates a critical reconciliation task containing campaign, order, batch, committed quantity, source/payment-line identity, reversal amount, and status.

The administrator resolves physical/vendor cost consequences separately from the verified customer payment reversal. This preserves whether IZHE incurred an unrecoverable product cost.

## Give One boundary

Give One remains a separate individual-address recipient path. Paid church-pickup batches contain paid order line items only. Deterministic Give One obligations may be suspended by source-payment review, but recipient redemptions are not automatically moved into church pickup.

## Bulk freight and campaign costs

Church-pickup orders do not receive individual shipping and the standard per-order shipping charge is not applied. Bulk freight/vendor delivery can be recorded as campaign cost through the append-only mission ledger; it is not automatically passed through to each pickup customer.

## Backward compatibility and legacy treatment

- Existing individual-shipping campaigns work without pickup fields.
- Existing campaigns missing `churchBatch` normalize safely.
- Existing orders without fulfillment snapshots are interpreted by legacy normalization, but their financial precision is not manufactured from current catalog values.
- Existing Give One public codes are preserved/wrapped into deterministic obligations when reconciliation can prove the source entitlement.
- Existing submitted production batches remain historical after later payment reversals.
- Old permanent fulfillment-lock records may be reported by the dry-run migration audit; they are not the current resumable-workflow authority and are not deleted by that report.

## Stripe test-mode acceptance

Church batch remains subject to the wider payment-integrity acceptance in [PAYMENT-ACCOUNTABILITY-INTEGRITY.md](./PAYMENT-ACCOUNTABILITY-INTEGRITY.md). At minimum, isolated test-mode acceptance must prove:

- church pickup Checkout has no individual shipping collection/charge while tax remains separately recorded;
- paid fulfillment produces exactly one order, stable pickup code, canonical payment/line settlement, indexes, and Give One obligations;
- webhook replay is idempotent;
- proven pre-batch whole-unit refund adjusts batch eligibility only for the affected unit;
- ambiguous partial refund blocks production and holds/suspends rather than guesses/cancels;
- full pre-batch refund prevents batch inclusion;
- post-submission reversal preserves production and creates a critical task;
- hybrid direct-shipping never enters a church batch;
- Give One redemption never enters a paid-order church batch.

Real Stripe test-mode acceptance requires isolated test credentials/environment and must be recorded before production completeness is claimed.

## Explicit non-goals

This pass does not implement multiple pickup locations, mixed fulfillment within one Checkout Session, customer accounts, named administrator accounts/RBAC/MFA, a new email provider, carrier labels, international fulfillment, inventory procurement, vendor PO automation, Give One church pickup, customer self-service refund allocation, or a storefront redesign.
