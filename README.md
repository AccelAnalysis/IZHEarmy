# IZHE Live Commerce and Give One Website

This repository powers the IZHE storefront, book and apparel collections, Stripe Checkout, Give One issuance and redemption, church inquiries, catalog administration, and fulfillment operations.

## Catalog foundation

The storefront, Stripe Checkout validation, manual Give One code creation, catalog preview, and redemption workflow now read from one central catalog stored in Netlify Blobs. On the first catalog request after deployment, the application seeds the current Collection 1 records automatically.

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
- Netlify Functions for checkout, webhooks, catalog, media, redemption, and operations
- Netlify Blobs for the catalog, uploaded media, checkout drafts, orders, Give One codes, and redemption records
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

When `STRIPE_STANDARD_SHIPPING_RATE_ID` is omitted, the Checkout function creates the approved $6.99 Standard U.S. Shipping rate inline for each Checkout Session.

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

All shirt products and the physical book are classified in Stripe as taxable tangible goods with tax-exclusive prices. Stripe calculates the applicable tax from the shipping address.

Before accepting live taxable orders:

1. Open **Tax → Registrations**.
2. Add the Virginia sales-tax registration using the business's exact Isle of Wight County operating address and legally effective registration date.
3. Open **Tax → Settings** and confirm the same exact address as the business origin/head-office address.
4. Verify that tax calculation appears in a Virginia test Checkout and in an out-of-state Checkout.

The repository intentionally does not hard-code a street address or tax registration date.

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

## Catalog administration

Open:

```text
https://YOUR-DOMAIN/admin.html
```

Enter the value of `IZHE_ADMIN_TOKEN`. The dashboard includes:

- **Overview** — catalog health, publication counts, unavailable products, orders, codes, and fulfillment alerts
- **Collections** — create future collections, manage teaching/book details, schedule availability, and control publishing
- **Products** — edit copy, Stripe lookup keys, prices, images, Give One eligibility, variants, publishing, and availability
- **Media** — upload JPG, PNG, or WebP product images up to 5 MB and assign them as primary or gallery images
- **Orders & Give One** — view orders, create manual codes, manage redemptions, export CSV data, and mark gifts fulfilled

### Publishing workflow

1. Create or edit a collection and keep it in `draft` while preparing it.
2. Create products under that collection, add at least one image, and configure apparel variants.
3. Keep products in `draft` or `hidden` until their Stripe lookup keys and prices are ready.
4. Use **Preview Catalog** to inspect draft, hidden, paused, and scheduled records without exposing them publicly.
5. Set the collection and product to `published` and choose `available` or `preorder` when ready.
6. The storefront refreshes from the published catalog, while checkout independently validates the same product, variant, amount, and availability record.

Product and collection IDs cannot be changed after creation because paid orders, Give One codes, and fulfillment records retain those references. Product and variant snapshots are also stored with paid orders and Give One codes so later catalog edits do not rewrite historical obligations.

## Checkout and fulfillment flow

1. The browser sends product ID, variant ID, fit, size, and quantity.
2. The server loads the central published catalog and validates product and variant availability.
3. The server resolves active Stripe Prices by lookup key and verifies the amounts.
4. The cart and product snapshots are stored in a Netlify Blob checkout draft.
5. Stripe Checkout collects payment, shipping address, phone, shipping, and applicable tax.
6. The webhook confirms payment and stores the paid order.
7. Give One codes are generated according to each eligible product's configured gift-unit rule; books generate none by default.
8. The recipient chooses an allowed fit and size and submits a U.S. shipping address.
9. The operations dashboard shows the redemption for fulfillment.

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
- Checkout carts and product snapshots are stored server-side instead of being packed into Stripe metadata.
- Give One issuance happens only after confirmed payment.
- Redemption uses ETag conditional writes to prevent simultaneous reuse.
- Catalog writes use revision and ETag checks to prevent one administrator session from silently overwriting another.
- Refunds and disputes cancel unused Give One codes.
- If a code has already been redeemed, the related refunded or disputed order is marked for manual review.
