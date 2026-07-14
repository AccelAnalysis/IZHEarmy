# IZHE Live Commerce and Give One Website

This package turns the supplied IZHE design into an operational site with:

- Persistent shopping cart with product, size, and quantity selection
- Server-validated Stripe Checkout
- Paid-order verification and idempotent Give One code generation
- Printable QR claim cards on the post-checkout confirmation page
- One-time code validation and atomic redemption
- Shipping-address and size collection for Give One fulfillment
- Netlify Forms for church campaign and support requests
- Password-token operations dashboard for orders, codes, and redemptions
- Manual Give One code generation for offline or church orders
- CSV export of pending redemption records
- Privacy, terms, contact, success, and error pages

## Production stack

- Static front end hosted by Netlify
- Netlify Functions for checkout, webhooks, redemption, and operations
- Netlify Blobs for orders, Give One codes, and redemption records
- Stripe Checkout for payment collection and customer receipts
- Netlify Forms for church and contact submissions

## 1. Install and run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Netlify Dev serves the site and local functions together.

## 2. Required environment variables

Set these in Netlify under **Project configuration → Environment variables**:

```text
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
IZHE_ADMIN_TOKEN=a-long-random-secret
IZHE_SHIPPING_CENTS=695
SITE_URL=https://your-production-domain.example
```

Use Stripe test keys until the complete purchase and refund process has been tested.

## 3. Configure Stripe webhook

In Stripe Workbench / Developers, add this endpoint:

```text
https://YOUR-DOMAIN/.netlify/functions/stripe-webhook
```

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded`
- `charge.dispute.created`

Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET`.

## 4. Deploy

```bash
npm run deploy
```

Or connect this folder to a Git repository and import it into Netlify. The included `netlify.toml` identifies `public` as the publish directory and `netlify/functions` as the functions directory.

## 5. Operations

Open:

```text
https://YOUR-DOMAIN/admin.html
```

Enter the value of `IZHE_ADMIN_TOKEN`. The dashboard can:

- View Stripe-paid orders
- View active and redeemed Give One codes
- View pending fulfillment records and recipient addresses
- Generate codes for manual/offline orders
- Export redemptions to CSV
- Mark redemptions fulfilled and save a tracking number or fulfillment note

Netlify Forms submissions are available in the Netlify dashboard. Configure email notifications there for `church-interest` and `contact`.

## 6. Fulfillment workflow

1. A customer pays through Stripe Checkout.
2. The webhook stores the order and creates one Give One code per purchased shirt.
3. The confirmation page shows printable QR cards and claim links.
4. A recipient submits a code, size, and U.S. shipping address.
5. The code is atomically marked redeemed to prevent reuse.
6. The redemption appears in `admin.html` as `pending_fulfillment`.
7. Export the CSV or use the dashboard data to place the fulfillment order.

## Business settings to review before launch

- Product price: currently $35.00 per shirt
- Standard shipping: currently $6.95, controlled by `IZHE_SHIPPING_CENTS`
- Shipping territory: currently United States only
- Sizes: S, M, L, XL, XXL
- Give One ratio: one claim code per purchased shirt
- Returns, refunds, exchanges, replacement claims, taxes, and chargeback handling
- The final product photography and production garment specifications
- Counsel review of privacy policy and terms

## Refunds and disputes

The Stripe webhook cancels unused Give One codes when a charge is refunded or disputed. If a code was already redeemed, the order is marked `refund_requires_review` in the stored order record so the team can resolve the fulfillment and financial exception.

## Security notes

- Stripe secret keys and the admin token remain server-side.
- Prices and product availability are validated in the checkout function, not trusted from the browser.
- Give One redemption uses an ETag conditional write so the same code cannot be redeemed simultaneously twice.
- The operations dashboard requires a bearer token; replace this with full identity-based administrator authentication as the team grows.
