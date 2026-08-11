# Priority 3 — Church Campaigns

The IZHE website and operations dashboard support church and ministry campaigns as first-class operational records.

## Church inquiry management

The public church form stores a structured inquiry in `izhe-church-inquiries`. Administrators can search inquiries, update status, assign a team member, set follow-up dates, add internal notes, and convert an inquiry into a campaign.

Inquiry statuses are `new`, `contacted`, `discovery_scheduled`, `plan_sent`, `confirmed`, `converted`, `completed`, and `declined`.

## Campaign records

Campaigns are stored in `izhe-campaigns` and include organization, campaign/public titles, ministry objective, contact information, campaign type/lifecycle status, public-page status, presentation/ordering dates, campaign product restrictions, fulfillment method, goals, ministry-support model, public page content, and internal notes.

For `church_batch` and `hybrid`, the campaign also stores the structured church-pickup location, public/internal instructions, dates, and administrator-only contact details defined in [CHURCH-BATCH-FULFILLMENT.md](./CHURCH-BATCH-FULFILLMENT.md).

A published scheduled/active pickup-capable campaign is not purchasable until pickup location name, street address, city, two-letter state, valid ZIP, and public instructions are complete. `individual_shipping` campaigns remain backward compatible without those fields.

## Campaign-specific catalog and checkout

A campaign may expose entire collections, individual products, or both. The public campaign endpoint filters the central catalog to that assortment. Stripe Checkout validates the same campaign restrictions on the server before creating a Checkout Session.

Campaign attribution remains stored on checkout drafts, Stripe metadata, paid orders, Give One codes/redemptions, and production batches.

Fulfillment is now server-authoritative:

- `individual_shipping` uses the current direct-shipping Checkout path.
- `church_batch` omits individual shipping address/rate and saves a church-pickup snapshot.
- `hybrid` requires an explicit purchaser choice and permits only one fulfillment mode per Checkout Session.

## Landing pages and QR codes

Published campaigns receive `/campaign/CAMPAIGN-SLUG`. The page includes campaign identity/message, dates, products/cart, metrics, sharing/QR controls, and the public-safe fulfillment promise. Hybrid campaigns require an accessible fulfillment selection before checkout.

## Church-pickup batch fulfillment

The campaign editor exposes **Build or Refresh Church Pickup Batch**. Automatic pickup batches:

- Include paid order line items only.
- Include only the selected campaign and saved `church_batch` fulfillment mode.
- Exclude direct-shipping orders, Give One redemptions, refunded/disputed/cancelled/refund-review orders, and already allocated line items.
- Preserve exact product/variant/SKU snapshots.
- Store a church pickup destination snapshot and `batchType: "campaign_church_pickup"`.
- Refresh only `draft`/`ready` batches; submitted/later batches are immutable to the automatic assembler and later orders create supplemental batches.

Give One recipient fulfillment remains the separate individual-address path in this phase. Manual gift-redemption production batches remain available.

## Pickup completion

Pickup batch `received`/`completed` means the production shipment reached the church. It moves linked paid pickup orders to `ready_for_pickup`, never `ready_to_ship` and never directly to completed. Administrators then search by purchaser or pickup code and record the individual handoff. The campaign pickup roster can be exported as CSV.

## Campaign performance and ministry-support reports

Existing sales, unit, Give One, batch, goal, and ministry-support metrics remain. Pickup campaigns additionally report paid pickup orders/units, unbatched/batched/in-production units, ready-for-pickup orders, picked-up orders, pickup exceptions, and direct-shipping order counts for hybrid campaigns. Give One obligations are not mixed into these paid-order pickup counts.

## Campaign alerts and integrity

The existing campaign alerts remain. Pickup configuration health prevents a published scheduled/active pickup campaign from becoming purchasable when required fields are missing. Operational alerts additionally flag refunds/cancellations that occur after a pickup batch has been submitted or entered production so vendor obligations are reconciled manually rather than silently rewritten.

Campaign/inquiry administration continues to require `IZHE_ADMIN_TOKEN`; checkout continues to validate campaign status, ordering dates, catalog restrictions, fulfillment mode, and Stripe prices server-side. Campaign and batch writes use conditional updates for concurrency protection.
