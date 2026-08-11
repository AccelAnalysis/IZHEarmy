# IZHE Live Commerce and Give One Website

This repository powers the IZHE storefront, book and apparel collections, Stripe Checkout, Give One issuance and redemption, church inquiries/campaigns, catalog administration, and fulfillment operations.

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
- The book is not Give One eligible

Stripe prices are resolved server-side through lookup keys. The browser never supplies or controls the amount charged.

## Production stack

- Static front end hosted by Netlify
- Netlify Functions for checkout, webhooks, catalog, media, redemption, campaigns, and operations
- Netlify Blobs for the catalog, uploaded media, checkout drafts, orders, Give One codes, redemption records, campaigns, and production batches
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
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
IZHE_ADMIN_TOKEN=a-long-random-secret
IZHE_SHIPPING_CENTS=699
SITE_URL=https://izhearmy.netlify.app
```

Optional:

```text
STRIPE_STANDARD_SHIPPING_RATE_ID=shr_...
```

When `STRIPE_STANDARD_SHIPPING_RATE_ID` is omitted, the Checkout function creates the approved $6.99 Standard U.S. Shipping rate inline for each **individual-shipping** Checkout Session. Church-pickup Checkout Sessions do not add that per-order shipping rate.

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

All shirt products and the physical book are classified in Stripe as taxable tangible goods with tax-exclusive prices. Individual-shipping Checkout collects a U.S. shipping address. Church pickup requires billing-address collection because no individual shipping address exists.

Before accepting live taxable orders:

1. Open **Tax → Registrations**.
2. Add the Virginia sales-tax registration using the business's exact Isle of Wight County operating address and legally effective registration date.
3. Open **Tax → Settings** and confirm the same exact address as the business origin/head-office address.
4. Verify tax calculation in direct-shipping and church-pickup Stripe **test-mode** Checkout sessions.
5. Obtain qualified tax review for pickup-location sourcing before unrestricted live church-pickup use.

The repository intentionally does not hard-code a street address, tax registration date, or pickup tax-sourcing rule.

## Stripe webhook

Configure this endpoint:

```text
https://YOUR-DOMAIN/.netlify/functions/stripe-webhook
```

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`

Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET`.

## Catalog and operations administration

Open:

```text
https://YOUR-DOMAIN/admin.html
```

Enter the value of `IZHE_ADMIN_TOKEN`. The dashboard includes catalog, church inquiries/campaigns, orders, Give One, fulfillment, production batches, media, reports, and operational alerts.

### Publishing workflow

1. Create or edit a collection and keep it in `draft` while preparing it.
2. Create products under that collection, add at least one image, and configure apparel variants.
3. Keep products in `draft` or `hidden` until their Stripe lookup keys and prices are ready.
4. Use **Preview Catalog** to inspect draft, hidden, paused, and scheduled records without exposing them publicly.
5. Set the collection and product to `published` and choose `available` or `preorder` when ready.
6. The storefront refreshes from the published catalog, while checkout independently validates the same product, variant, amount, and availability record.

Product and collection IDs cannot be changed after creation because paid orders, Give One codes, and fulfillment records retain those references. Product and variant snapshots are also stored with paid orders and Give One codes so later catalog edits do not rewrite historical obligations.

## Checkout and fulfillment flow

1. The browser sends product ID, variant ID, fit, size, quantity, campaign slug when applicable, and a hybrid fulfillment selection when required.
2. The server loads the central published catalog and validates product/variant availability and campaign restrictions.
3. The server authoritatively resolves fulfillment mode; browser/local-storage state is never accepted without campaign validation.
4. The server resolves active Stripe Prices by lookup key and verifies the amounts.
5. Cart, product, campaign, and immutable fulfillment snapshots are stored in a Netlify Blob checkout draft.
6. Individual shipping collects a U.S. shipping address and configured shipping rate. Church pickup omits both, requires billing address, and keeps automatic tax enabled.
7. The webhook confirms payment, stores Stripe totals and the paid order, and generates a stable pickup code when applicable.
8. Give One codes are generated according to each eligible product's configured gift-unit rule; books generate none by default.
9. Give One recipients continue to choose an allowed variant and submit their own U.S. shipping address.
10. Church-pickup paid orders are administrator-batched, delivered to the campaign location, moved to `ready_for_pickup`, and individually handed off using the pickup workflow.

## Church batch fulfillment

Campaign fulfillment methods are:

- `individual_shipping` — existing direct-to-customer shipping.
- `church_batch` — the entire campaign checkout is delivered with the church/ministry consolidated order; no individual shipping charge or shipping address is used.
- `hybrid` — the purchaser explicitly selects one of the two modes for the entire Checkout Session.

For pickup-capable campaigns, administrators configure one structured church pickup/delivery location, public instructions, pickup dates/window, internal instructions, and church contact information. Paid pickup orders receive an immutable location snapshot and `PICK-XXXX-XXXX-XXXX` code.

Use **Build or Refresh Church Pickup Batch** from the campaign editor to create the campaign production obligation. The automatic assembler includes paid church-pickup order line items only; direct-shipping orders and Give One redemptions are excluded. Draft/ready batches may be refreshed; submitted/later batches are preserved and later orders create supplemental numbered batches.

When the batch is received at the church, linked pickup orders become `ready_for_pickup`, not `ready_to_ship`. Administrator handoff records the releaser, recipient, timestamp, note, and any exception/correction. The campaign pickup roster is administrator-only and can be exported to CSV.

See [`docs/CHURCH-BATCH-FULFILLMENT.md`](docs/CHURCH-BATCH-FULFILLMENT.md) for the complete state model, privacy boundary, refund reconciliation, Give One scope boundary, test-mode checklist, and tax caveat.

**Church-pickup orders do not receive individual shipping and the standard per-order shipping charge is not applied.** Bulk freight/vendor delivery may be recorded as a campaign cost through the existing accountability workflow rather than being automatically charged to each pickup customer in this phase.

## Product image management

Uploaded images are stored in the `izhe-media` Netlify Blobs store and served through the media function. Administrators can reuse an uploaded image across products, assign primary/gallery roles, add image URLs, and maintain accessible alt text. Published products must have at least one image.

## Deploy

Connect this repository to Netlify or run:

```bash
npm run deploy
```

The included `netlify.toml` identifies `public` as the publish directory and `netlify/functions` as the functions directory.

## Security and integrity

- Stripe secret keys and the administrator token remain server-side.
- Prices and availability are validated server-side against the central catalog.
- Checkout carts and product/fulfillment snapshots are stored server-side instead of being packed into Stripe metadata.
- The server authoritatively validates campaign fulfillment mode.
- Public campaign fulfillment projections omit internal instructions and administrator-only church contacts.
- Give One issuance happens only after confirmed payment.
- Redemption uses ETag conditional writes to prevent simultaneous reuse.
- Catalog, campaign, order, and batch writes use revision/ETag protections where the workflow requires concurrency control.
- Refunds and disputes cancel unused Give One codes.
- If a code has already been redeemed, the related refunded or disputed order is marked for manual review.
- Refund/cancellation after a church pickup batch is submitted preserves production history and creates an operational reconciliation alert.
