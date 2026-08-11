# Church Batch Fulfillment

This document governs the bounded church-pickup fulfillment capability for IZHE campaigns. It extends the existing campaign, Stripe Checkout, order, Give One, production-batch, and administrator workflows without creating a second commerce platform.

## Fulfillment definitions

### `individual_shipping`

The existing direct-to-customer path. Stripe Checkout collects a U.S. shipping address, applies the configured standard shipping rate, keeps automatic tax enabled, and the order follows the shipping-oriented lifecycle. These orders are never automatically included in a campaign church-pickup batch.

### `church_batch`

The entire checkout is consolidated with other paid campaign pickup orders and delivered to the participating church or ministry. The purchaser does not provide an individual shipping address and does not pay the normal per-order direct-shipping charge. Stripe Checkout requires billing information for tax calculation. The paid order stores an immutable pickup-location promise and a human-readable pickup confirmation code. After the church receives the production batch, the purchaser order becomes `ready_for_pickup` until an administrator records the handoff.

### `hybrid`

The campaign supports both modes. The purchaser must explicitly choose either church pickup or direct shipping before Checkout. One Checkout Session has one fulfillment mode; mixed pickup/shipping carts are intentionally unsupported. The server validates the requested mode against the campaign rather than trusting browser state.

## Campaign pickup configuration

`church_batch` and `hybrid` campaigns use a structured `churchBatch` object with:

- Pickup location name
- Address line 1 and optional address line 2
- City
- Two-letter U.S. state
- Five-digit ZIP or ZIP+4
- Country fixed to `US`
- Public pickup instructions
- Internal fulfillment instructions
- Estimated ready date/time
- Pickup-window start and end
- Church pickup contact name
- Contact email
- Contact phone

Pickup location name, address line 1, city, state, ZIP, and public instructions are required before a published scheduled/active pickup campaign can accept orders. Invalid states, ZIPs, emails, and pickup dates are rejected server-side. Existing `individual_shipping` campaigns require no pickup configuration. Legacy records missing `churchBatch` are normalized to a safe empty structure without destructive migration.

The legacy/general `fulfillmentNotes` field remains available for internal information; it is not the public pickup contract.

## Public campaign experience

The public campaign API exposes only the sanitized fulfillment projection:

- Campaign method and allowed modes
- Public readiness
- Pickup location name and address
- Public pickup instructions
- Estimated ready date
- Pickup-window dates

Internal fulfillment notes and church contact details are not part of the public projection.

For church pickup, the campaign page tells the purchaser before cart/Checkout that the order will travel with the church's consolidated campaign order and that no individual shipping charge will be added. Hybrid campaigns require an explicit radio selection. That selection is stored in campaign-scoped local storage, displayed in the cart, changeable before Checkout, and submitted to the server for validation.

## Stripe Checkout differences

All checkout paths retain server-side catalog validation, Stripe lookup-key/amount verification, phone collection, customer creation, invoices, promotions, and Stripe automatic tax.

For `individual_shipping`:

- U.S. shipping address collection remains enabled.
- The configured Stripe shipping rate is used, or the approved `IZHE_SHIPPING_CENTS` inline rate is used.
- Billing address collection remains the existing `auto` behavior.

For `church_batch`:

- `shipping_address_collection` is omitted.
- Direct-shipping `shipping_options` are omitted.
- The normal per-order shipping charge is not applied.
- `billing_address_collection` is `required`.
- `automatic_tax.enabled` remains `true`.
- Checkout custom text describes church/campaign pickup and states that no individual shipment will be sent.
- The full pickup snapshot stays in the server-side checkout draft rather than Stripe metadata.

### Tax review caveat

The application does not invent pickup tax sourcing rules. Live tax treatment for church/campaign pickup transactions must be reviewed with a qualified tax professional before unrestricted public production use. Stripe automatic tax remains enabled, and billing address collection is required when no shipping address exists.

## Checkout draft and paid order snapshot

The checkout draft stores the server-resolved fulfillment mode and an immutable snapshot containing:

- Mode
- Campaign fulfillment method
- Source (`campaign` or `general_storefront`)
- Pickup-location snapshot, when applicable
- Public instructions
- Estimated ready date
- Pickup-window dates
- Fulfillment status

Church-pickup orders receive one secure code in the form `PICK-XXXX-XXXX-XXXX`. The code is generated once and preserved through webhook/order-status retries.

Paid orders persist Stripe Checkout totals directly:

- Merchandise subtotal
- Shipping amount
- Tax amount
- Discount amount
- Total paid
- Currency

For church pickup, the stored shipping amount is zero. Historical confirmation pages use the order snapshot and stored Stripe totals rather than the current campaign/catalog.

## Paid-order lifecycle

Church pickup uses a nested fulfillment state distinct from direct shipping:

1. Paid order → `awaiting_batch`
2. Batch `ready` or `submitted` → `allocated`
3. Batch `in_production` → `in_production`
4. Batch `received` or `completed` → `ready_for_pickup`
5. Administrator confirms handoff → nested `picked_up`, root order `completed`
6. Exception/no-show → explicit exception state

`received` means received at the church/campaign pickup location. Production-batch `completed` does **not** prove that individual purchasers picked up their orders.

Individual-shipping orders retain their existing `ready_to_ship`, shipped, delivered, and completed behavior.

## Build or Refresh Church Pickup Batch

The administrator campaign action is server-authoritative. It:

- Requires administrator authorization.
- Loads the selected campaign and validates church-pickup support/readiness.
- Reads authoritative paid orders and production batches.
- Includes only paid, non-cancelled, non-refunded, non-refund-review campaign orders whose saved fulfillment mode is `church_batch`.
- Excludes direct-shipping hybrid orders, general-storefront orders, Give One redemptions, disputed/refunded/cancelled orders, and source line items already allocated to another active batch.
- Uses stable source IDs based on order reference and item index.
- Preserves product, variant, fit, size, color, SKU, and quantity snapshots.
- Aggregates production totals by SKU/product/variant/fit/size/color.
- Stores the campaign and pickup/delivery destination snapshot on the batch.

If an editable `draft` or `ready` pickup batch exists, it is refreshed in place using ETag protection. Newly ineligible items are removed safely before submission. Once a batch is `submitted`, `in_production`, `received`, `completed`, or `cancelled`, the automatic action does not mutate it. New eligible orders create a numbered supplemental batch:

```text
[Campaign Title] — Church Pickup Batch 1
[Campaign Title] — Church Pickup Batch 2
```

Identity is structural (`batchType: "campaign_church_pickup"`), not name-based.

## Production-batch destination and receipt

Church-pickup production batches store/derive:

- Batch type
- Campaign ID/title/organization
- Church pickup/delivery destination snapshot
- Vendor
- Due date
- Vendor-to-church tracking/reference
- Submitted date
- Received date
- Received by
- Internal notes
- Production summary
- Source order line items

The lifecycle remains `draft → ready → submitted → in_production → received → completed`, with `cancelled` as an explicit terminal path.

## Pickup handoff

The existing operations search indexes the whole order record, so administrators can locate pickup orders by purchaser name, email, phone, pickup code, or Checkout/order reference. Campaign-specific filtering is available server-side, and the order drawer displays the saved pickup promise.

A protected handoff endpoint records:

- Released by
- Recipient name (when different)
- Note
- Pickup timestamp
- Exception/no-show details
- Corrective reversal history

Only `ready_for_pickup` orders can normally be marked picked up. Duplicate pickup confirmation is rejected. Reversing a pickup requires an explicit corrective note. Handoff changes do not mutate Stripe payment records or Give One codes.

## Pickup roster and CSV

The administrator-only campaign roster includes campaign, pickup code, order reference, purchaser contact fields, product/fit/size/color/quantity, amount paid, fulfillment status, batch ID/status, pickup location/window, pickup timestamp, released by, recipient name, and exception note. The endpoint supports filtered JSON and CSV output.

## Campaign operational metrics

Campaign administration calculates from authoritative orders and batch assignments:

- Paid church-pickup orders
- Paid church-pickup units
- Unbatched units
- Batched units
- Units in production
- Orders ready for pickup
- Orders picked up
- Pickup exceptions
- Direct-shipping orders for hybrid campaigns

Give One obligations are deliberately not counted in paid-order church-pickup metrics.

## Refund/cancellation reconciliation

Before submission, a refresh of a draft/ready pickup batch excludes newly refunded, disputed, cancelled, or refund-review orders.

After submission/in-production/receipt/completion, source history is preserved. A refunded, cancelled, or refund-review order linked to an active/submitted pickup batch creates a critical operational reconciliation alert with order, campaign, batch, and quantity context. Administrators must reconcile the vendor/physical obligation manually; the system does not silently remove it.

## Give One scope boundary

This phase does **not** change the Give One recipient promise. Give One recipients continue to enter their own U.S. fulfillment address and remain on the existing individual gift-fulfillment path. Automatically generated church-pickup batches contain paid order line items only. Administrators may continue creating separate manual production batches containing gift redemptions.

Campaign-based Give One pickup is a future product decision and is intentionally not partially implemented here.

## Bulk freight and campaign costs

Church-pickup orders do not receive individual shipping, and the standard per-order shipping charge is not applied. Bulk freight or vendor delivery costs may be recorded as campaign costs through the existing accountability workflow; they are not automatically passed through to each pickup customer in this phase.

## Backward compatibility

- Existing `individual_shipping` campaigns work without new fields.
- Existing campaigns missing `churchBatch` load with an empty safe object.
- Existing orders without a fulfillment snapshot are interpreted as legacy individual-shipping orders.
- Existing Give One issuance, validation, redemption, and manual gift batching remain separate.
- Campaign IDs, slugs, dates, product restrictions, support calculations, mission-support ledger behavior, and catalog snapshots remain intact.

## Manual production setup and Stripe test-mode checklist

Before a deploy-preview/manual acceptance run:

1. Use Stripe **test mode** keys and webhook signing secret only.
2. Confirm `IZHE_SHIPPING_CENTS` and/or the test shipping rate match the intended direct-shipping test setup.
3. Confirm Netlify Blobs/function storage is isolated from production data.
4. Create one `church_batch` campaign and one `hybrid` campaign with a complete pickup configuration.
5. Run the acceptance scenarios below; do not change live Stripe settings.
6. Obtain tax-professional review before unrestricted live pickup transactions.

### Acceptance scenarios

- **A — Church batch:** visible pickup promise → no shipping address/rate in Checkout → paid order snapshot/pickup code → unbatched → batch build → submitted → production → received → ready for pickup → code search → handoff → roster.
- **B — Hybrid pickup:** checkout blocked until explicit choice → pickup path behaves exactly like church batch.
- **C — Hybrid direct shipping:** explicit shipping choice → Stripe shipping address/rate → excluded from church pickup batch → normal shipping lifecycle.
- **D — General storefront:** direct-shipping behavior unchanged.
- **E — Refund before batching:** refunded/disputed/refund-review order excluded from a refreshed/new pickup batch.
- **F — Refund after submission:** production history retained and critical reconciliation alert created.

### Current verification record

Automated pure-logic and syntax checks are part of `npm test`/CI. A real Stripe test-mode Checkout walkthrough requires a configured local or deploy-preview Netlify/Stripe test environment; it must be recorded in the pull request before this capability is described as production-complete.

## Explicit non-goals

This pass does not implement multiple pickup locations, mixed fulfillment in one Checkout Session, customer accounts, new administrator authentication, a new email provider, carrier labels, international fulfillment, inventory purchasing, vendor PO integration, Give One church pickup, full partial-refund allocation redesign, or a general site redesign.
