# IZHE Live Commerce and Give One Website

This repository powers the IZHE storefront, book and apparel collections, Stripe Checkout, Give One issuance and redemption, church inquiries/campaigns, catalog administration, fulfillment operations, and mission accountability.

## Catalog foundation

The storefront, Stripe Checkout validation, manual Give One code creation, catalog preview, and redemption workflow read from one central catalog stored in Netlify Blobs. On the first catalog request after deployment, the application seeds the current Collection 1 records automatically.

The catalog supports:

- Multiple collections and companion books
- Apparel, book, bundle, and other product types
- Product images and reusable uploaded media
- Product, collection, and variant availability
- Draft, published, hidden, and archived publishing states
- Available-from and available-until scheduling
- Stripe Price lookup keys and server-verified amounts
- Explicit mission-support eligibility
- Give One eligibility and configurable gift units per paid unit
- Immutable collection and product IDs for stable historical references
- Catalog revisions and ETag conflict protection

## Seeded Collection 1 catalog

- 12 Collection 1 shirt designs
- Adult pricing category: $37.00
- Kids pricing category: $27.00
- Adult fits: Men and Women
- Kids fits: Boys and Girls
- Physical companion book: $22.00
- One Give One claim per paid shirt
- Existing Collection 1 shirts are explicitly mission-support eligible under the current approved model
- The physical book is neither Give One eligible nor mission-support eligible by default

Stripe prices are resolved server-side through lookup keys. The browser never supplies or controls the amount charged.

## Production stack

- Static front end hosted by Netlify
- Netlify Functions for checkout, webhooks, catalog, media, redemption, campaigns, operations, reconciliation, and accountability
- Netlify Blobs for the catalog, uploaded media, checkout drafts, orders, deterministic Give One obligations/codes, redemption records, campaigns, production batches, Stripe event receipts, resumable order workflows, reconciliation tasks/history, payment indexes, and the mission ledger
- Stripe-hosted Checkout for payment collection
- Stripe Tax automatic calculation at Checkout
- Netlify Forms for church and contact submissions

## Install and run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Netlify Dev serves the site and local functions together.

## Required environment variables

Set these in Netlify under **Project configuration → Environment variables**:

```text
STRIPE_SECRET_KEY=<server-side Stripe key>
STRIPE_WEBHOOK_SECRET=whsec_...
IZHE_ADMIN_TOKEN=a-long-random-secret
IZHE_SHIPPING_CENTS=699
SITE_URL=https://izhearmy.netlify.app
```

Optional:

```text
STRIPE_STANDARD_SHIPPING_RATE_ID=shr_...
```

When `STRIPE_STANDARD_SHIPPING_RATE_ID` is omitted, the Checkout function creates the approved Standard U.S. Shipping rate inline for each **individual-shipping** Checkout Session using the configured fallback cents. Church-pickup Checkout Sessions do not add that per-order shipping rate.

## Stripe catalog lookup keys

Each product record contains a Stripe Price lookup key. The seeded records include Adult and Kids prices for each design, such as:

```text
izhe_c1_yhwh_adult_usd
izhe_c1_yhwh_kids_usd
izhe_c1_iam_adult_usd
izhe_c1_iam_kids_usd
...
izhe_c1_lord_of_lords_adult_usd
izhe_c1_lord_of_lords_kids_usd
```

The physical book uses:

```text
izhe_c1_book_physical_usd
```

Updating a website price does not silently change Stripe. Checkout opens only when an active Stripe Price with the configured lookup key has the same USD amount as the approved catalog record.

## Stripe Tax setup

Checkout uses:

```js
automatic_tax: { enabled: true }
```

All shirt products and the physical book are classified in Stripe as taxable tangible goods with tax-exclusive prices. Individual shipping collects a U.S. shipping address. Church pickup requires billing-address collection because no individual shipping address exists.

Before accepting live taxable orders:

1. Open **Tax → Registrations**.
2. Add the applicable registration using the business's exact operating facts and legally effective date.
3. Open **Tax → Settings** and confirm the intended business-origin/head-office configuration.
4. Verify tax calculation in direct-shipping and church-pickup Stripe **test-mode** Checkout sessions.
5. Obtain qualified tax review for pickup-location sourcing before unrestricted live church-pickup use.

The repository intentionally does not hard-code a street address, tax registration date, or pickup tax-sourcing rule.

## Stripe webhook

Configure this endpoint:

```text
https://YOUR-DOMAIN/.netlify/functions/stripe-webhook
```

Subscribe to the Checkout/payment-reversal lifecycle currently handled by the repository:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`
- `refund.created`
- `refund.updated`
- `refund.failed`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `charge.dispute.funds_reinstated`
- `charge.dispute.funds_withdrawn`

Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET`.

The webhook verifies the signature before creating a trusted privacy-minimized receipt in `izhe-stripe-events`. Event ID is the event-level idempotency key. Failed required effects remain retryable/reconcilable instead of being acknowledged as completed. Full raw Stripe payloads, payment-method details, and unnecessary customer PII are not stored in the event receipt.

## Catalog and operations administration

Open:

```text
https://YOUR-DOMAIN/admin.html
```

Enter the value of `IZHE_ADMIN_TOKEN`. The dashboard includes catalog, church inquiries/campaigns, orders, Give One, fulfillment, production batches, media, reports, payment integrity, reconciliation, and operational alerts.

### Publishing workflow

1. Create or edit a collection and keep it in `draft` while preparing it.
2. Create products under that collection, add at least one image, configure apparel variants, and explicitly choose mission-support eligibility.
3. Keep products in `draft` or `hidden` until their Stripe lookup keys and prices are ready.
4. Use **Preview Catalog** to inspect draft, hidden, paused, and scheduled records without exposing them publicly.
5. Set the collection and product to `published` and choose `available` or `preorder` when ready.
6. The storefront refreshes from the published catalog, while Checkout independently validates the same product, variant, amount, availability, campaign, and fulfillment record.

Product and collection IDs cannot be changed after creation because paid orders, Give One obligations/codes, and fulfillment records retain those references. Product/variant/support/Give One snapshots are stored with Checkout/paid orders so later catalog edits do not rewrite historical obligations.

## Checkout and fulfillment flow

1. The browser sends product ID, variant ID, fit, size, quantity, campaign slug when applicable, and a hybrid fulfillment selection when required.
2. The server loads the central published catalog and validates product/variant availability and campaign restrictions.
3. The server authoritatively resolves fulfillment mode; browser/local-storage state is never accepted without campaign validation.
4. The server resolves active Stripe Prices by lookup key and verifies the amounts.
5. Cart, product/eligibility, campaign/support-policy, and immutable fulfillment snapshots are stored in a Netlify Blob checkout draft.
6. Individual shipping collects a U.S. shipping address and configured shipping rate. Church pickup omits both, requires billing address, and keeps automatic tax enabled.
7. The verified paid webhook enters a resumable per-Session workflow with an expiring lease. It stores canonical integer-cent Stripe settlement, immutable line settlement/discount allocation, the order, indexes, deterministic Give One obligations, and accountability projection.
8. Each eligible paid/gift unit combination has one deterministic Give One obligation identity. The public claim code is random/human-friendly but is created once and mapped to that obligation.
9. Give One recipients continue to choose an allowed variant and submit their own U.S. shipping address.
10. Church-pickup paid orders are administrator-batched, delivered to the campaign location, moved to `ready_for_pickup`, and individually handed off using the pickup workflow.

A retry does not simply return an existing order: it verifies/repairs required indexes, event links, line settlement, gift obligations/mappings, and accountability state.

## Payment, refunds, disputes, and reconciliation

The canonical `order.payment` model separates capture, refund, dispute, and reconciliation state from operational fulfillment status. Amounts are integer cents and distinguish merchandise gross, discounts, net merchandise, shipping, tax, total charged, actual cumulative refunds, refund allocation, disputes, net collected, held amounts, and verified processor fee/net deposit when available.

Partial refunds are never automatically converted into whole-order reversals. A refund that cannot be assigned confidently to merchandise/shipping/tax/whole units is retained at its actual Stripe amount, marked `allocation_required`, placed into the administrator reconciliation queue, and used to hold potentially affected support. Unused Give One obligations are suspended rather than irreversibly cancelled by guess.

Open disputes create holds and suspend unused obligations. Won/reinstated disputes can release holds/reactivate those same obligations. Lost disputes become final reversals; partial losses remain under allocation/reconciliation when their merchandise/unit effect cannot be proven. Redeemed/fulfilled Give One and production history are never deleted to make the payment state look clean.

Administrators can run **Reconcile with Stripe** in dry-run mode and explicitly apply local repairs with order revision protection. The reconciler reads Stripe and may repair local records/indexes/event links/obligation mappings; it does not issue refunds, capture/cancel payments, or modify Stripe products/prices/configuration.

See [`docs/PAYMENT-ACCOUNTABILITY-INTEGRITY.md`](docs/PAYMENT-ACCOUNTABILITY-INTEGRITY.md) for the full source hierarchy, formulas, allocation rules, reconciliation model, manual test acceptance, and release checklist.

## Church batch fulfillment

Campaign fulfillment methods are:

- `individual_shipping` — direct-to-customer shipping.
- `church_batch` — the entire campaign Checkout is delivered with the church/ministry consolidated order; no individual shipping charge or shipping address is used.
- `hybrid` — the purchaser explicitly selects one of the two modes for the entire Checkout Session.

For pickup-capable campaigns, administrators configure one structured church pickup/delivery location, public instructions, pickup dates/window, internal instructions, and church contact information. Paid pickup orders receive an immutable location snapshot and `PICK-XXXX-XXXX-XXXX` code.

Use **Build or Refresh Church Pickup Batch** from the campaign editor to create the production obligation. Automatic assembly includes captured paid church-pickup line items only; direct-shipping orders and Give One redemptions are excluded. Proven refunded whole units are removed from editable quantity. Open disputes/ambiguous reversals are held out of new production. Draft/ready batches may be refreshed; submitted/later batches are preserved and later eligible orders create supplemental batches.

If a refund/dispute arrives after production commitment, production history is preserved and a critical reconciliation task records the affected order/campaign/batch/quantity/payment-line/reversal facts.

When the batch is received at the church, linked pickup orders become `ready_for_pickup`, not `ready_to_ship`. Administrator handoff records the releaser, recipient, timestamp, note, and any exception/correction. The campaign pickup roster is administrator-only and can be exported to CSV.

See [`docs/CHURCH-BATCH-FULFILLMENT.md`](docs/CHURCH-BATCH-FULFILLMENT.md) for the complete pickup state model, privacy boundary, reversal reconciliation, Give One boundary, test-mode checklist, and tax caveat.

**Church-pickup orders do not receive individual shipping and the standard per-order shipping charge is not applied.** Bulk freight/vendor delivery may be recorded as campaign cost through the append-only accountability workflow rather than automatically charged to each pickup customer.

## Mission accountability

Campaign/organization reports distinguish commerce, mission support, Give One, operations, and reconciliation.

Support calculated/accrued, held, available, paid, outstanding, and overpaid are distinct. `supportPaid` requires an append-only support-payment ledger entry. Stripe reversals are authoritative payment facts and are not duplicated as manual refund ledger entries.

Support policy is versioned and snapshotted at Checkout. Percentage support uses net recognized support-eligible merchandise after discounts/allocated merchandise refunds; shipping/tax/noneligible merchandise are excluded. Per-unit support counts settled support-eligible whole units. Fixed support remains zero without qualifying activity and accrues once per policy version.

If a material payment/reconciliation condition is unresolved, the public campaign page says **Figures under reconciliation** and withholds provisional exact financial totals rather than presenting false precision. Private Stripe/customer/administrative details remain server/admin-only.

## Product image management

Uploaded images are stored in the `izhe-media` Netlify Blobs store and served through the media function. Administrators can reuse an uploaded image across products, assign primary/gallery roles, add image URLs, and maintain accessible alt text. Published products must have at least one image.

## Deploy

Connect this repository to Netlify or run:

```bash
npm run deploy
```

The included `netlify.toml` identifies `public` as the publish directory and `netlify/functions` as the functions directory.

A code merge/deploy is a separate release action. Payment/accountability implementation or automated tests alone do not establish Stripe test-mode acceptance or production completeness.

## Security and integrity

- Stripe secret keys, webhook secrets, and the administrator token remain server-side.
- Webhook signatures are verified before a trusted Stripe event receipt is created.
- Event receipts are privacy-minimized and contain a payload digest rather than unnecessary raw PII.
- Prices/availability are validated server-side against the central catalog and active Stripe Price.
- Checkout carts and product/campaign/support/fulfillment snapshots are stored server-side instead of being packed into untrusted browser state.
- Paid-order processing is resumable with expiring leases and invariant repair.
- Payment Intent, Checkout Session, and Charge indexes are repairable; reversal lookup can scan local orders when an index is missing so a verified event is not silently lost.
- Give One issuance uses deterministic obligations and idempotent public-code mappings.
- Redemption and fulfillment synchronize durable obligation history.
- Catalog, campaign, order, refund-allocation, reconciliation, ledger, and batch writes use conditional/revision protections where required.
- Mission-ledger writes are append-only and serialized by campaign/organization scope to prevent concurrent overpayment/over-reversal.
- Refund/dispute behavior suspends, cancels, reactivates, or creates exceptions according to objectively proven effects; it does not delete redeemed/fulfilled history.
- Public accountability omits customer/Stripe/private operational identifiers and discloses under-reconciliation state instead of false precision.
