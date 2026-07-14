# IZHE Live Commerce and Give One Website

This repository powers the IZHE storefront, Collection 1 book and apparel catalog, Stripe Checkout, Give One issuance and redemption, church inquiries, and fulfillment operations.

## Live catalog

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
- Netlify Functions for checkout, webhooks, redemption, and operations
- Netlify Blobs for checkout drafts, orders, Give One codes, and redemption records
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

Each design has one Adult and one Kids Price:

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

The server catalog in `netlify/functions/_shared/catalog.mjs` is the approved mapping between website product IDs, Stripe lookup keys, pricing, fit rules, sizes, and Give One eligibility.

## Stripe Tax setup

Checkout uses:

```js
automatic_tax: { enabled: true }
```

All shirt products and the physical book are classified in Stripe as taxable tangible goods with tax-exclusive prices. Stripe calculates the applicable tax from the shipping address.

Before accepting live taxable orders, complete these Stripe Dashboard steps:

1. Open **Tax → Registrations**.
2. Add the Virginia sales-tax registration using the business's exact Isle of Wight County operating address and the legally effective registration date.
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

## Checkout and fulfillment flow

1. The browser sends only product ID, fit, size, and quantity.
2. The server validates the selection against the approved catalog.
3. The server resolves active Stripe Prices by lookup key and verifies the amounts.
4. The cart is stored as a short-lived Netlify Blob checkout draft.
5. Stripe Checkout collects payment, shipping address, phone, shipping, and applicable tax.
6. The webhook confirms payment and stores the paid order.
7. One Give One code is generated per eligible paid shirt; the book generates none.
8. The recipient chooses the allowed fit and size and submits a U.S. shipping address.
9. The operations dashboard shows the redemption for fulfillment.

## Operations dashboard

Open:

```text
https://YOUR-DOMAIN/admin.html
```

The dashboard can:

- View Stripe-paid orders
- View active and redeemed Give One codes
- View recipient fit, size, and shipping information
- Generate Give One codes for manual or church shirt orders
- Export redemptions to CSV
- Mark redemptions fulfilled and save tracking information

## Deploy

Connect this repository to Netlify or run:

```bash
npm run deploy
```

The included `netlify.toml` identifies `public` as the publish directory and `netlify/functions` as the functions directory.

## Security and integrity

- Stripe secret keys and the administrator token remain server-side.
- Prices are loaded from Stripe lookup keys and checked against the approved catalog.
- Checkout carts are stored server-side instead of being packed into Stripe metadata.
- Give One issuance happens only after confirmed payment.
- Book purchases never generate Give One codes.
- Redemption uses ETag conditional writes to prevent simultaneous reuse.
- Refunds and disputes cancel unused Give One codes.
