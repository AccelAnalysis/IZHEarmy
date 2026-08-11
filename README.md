# IZHE Live Commerce, Give One, and Administration

This repository powers the IZHE storefront, book and apparel collections, Stripe Checkout, Give One issuance/redemption, church campaigns, fulfillment, mission accountability, and the secure IZHE Admin v2 operations application.

## Production architecture

- Static public storefront hosted by Netlify.
- Netlify Functions for checkout, Stripe webhooks, catalog/media/content, Give One, campaigns, fulfillment, reconciliation, accountability, and administration.
- Netlify Blobs for durable catalog, media, orders, deterministic Give One obligations/codes, redemptions, campaigns, batches, payment/reconciliation state, mission ledger, and Admin v2 identity/session/audit records.
- Stripe-hosted Checkout with server-authoritative product, price, campaign, and fulfillment validation.
- Provider-neutral OpenID Connect for named administrator authentication with MFA.

Admin v2 remains a native JavaScript/ES-module application rather than introducing a new application framework.

## Install and validation

```bash
npm install
npm test
npm run test:browser
```

`npm test` runs the repository unit/regression suite, payment-integrity syntax gates, Admin v2 security coverage, and recursive JavaScript syntax validation. `npm run test:browser` runs the Playwright responsive/interaction acceptance suite.

For local Netlify execution:

```bash
cp .env.example .env
netlify dev
```

Never commit `.env`, provider secrets, Stripe secrets, session/audit signing keys, or live administrator information.

## Required environment configuration

See `.env.example` for the complete safe template.

Core commerce variables include:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SITE_URL
IZHE_SHIPPING_CENTS
STRIPE_STANDARD_SHIPPING_RATE_ID
```

Admin v2 uses:

```text
IZHE_ADMIN_OIDC_ISSUER
IZHE_ADMIN_OIDC_CLIENT_ID
IZHE_ADMIN_OIDC_CLIENT_SECRET
IZHE_ADMIN_OIDC_REDIRECT_URI
IZHE_ADMIN_REQUIRED_ACR
IZHE_ADMIN_SESSION_SECRET
IZHE_ADMIN_AUDIT_SIGNING_SECRET
IZHE_ADMIN_BOOTSTRAP_EMAILS
```

Optional/configurable Admin v2 controls include allowed origins, session duration, recent-authentication duration, and upload malware-scanner configuration as documented in `.env.example`.

`IZHE_ADMIN_TOKEN` is retired. Admin v2 does not authorize it and must not be configured as an authentication fallback.

## Secure administration

Canonical route:

```text
https://YOUR-DOMAIN/admin/
```

`/admin.html` redirects to Admin v2. The former standalone `/visual-editor.html` redirects to `/admin/content/visual-editor`.

Administration is invitation-only. The identity provider authenticates the named user and enforces MFA; IZHE stores roles/status and issues an opaque server-side session using the `__Host-izhe_admin_session` cookie.

Admin v2 includes:

- Overview
- Products
- Collections
- Media Library
- Website Content
- Visual Editor
- Teaching Library
- Orders
- Give One
- Fulfillment
- Production Batches
- Church Pickup
- Campaigns
- Accountability
- Administrators & Roles
- Active Sessions
- Audit Log

See:

- [`docs/ADMIN-V2-ARCHITECTURE.md`](docs/ADMIN-V2-ARCHITECTURE.md)
- [`docs/ADMIN-V2-SECURITY-MODEL.md`](docs/ADMIN-V2-SECURITY-MODEL.md)
- [`docs/ADMIN-V2-ROLE-PERMISSION-MATRIX.md`](docs/ADMIN-V2-ROLE-PERMISSION-MATRIX.md)
- [`docs/ADMIN-V2-UX-STANDARDS.md`](docs/ADMIN-V2-UX-STANDARDS.md)
- [`docs/ADMIN-V2-OPERATIONS.md`](docs/ADMIN-V2-OPERATIONS.md)
- [`docs/ADMIN-V2-MIGRATION.md`](docs/ADMIN-V2-MIGRATION.md)
- [`docs/ADMIN-V2-ACCEPTANCE.md`](docs/ADMIN-V2-ACCEPTANCE.md)

## Catalog and Stripe price integrity

The storefront and Checkout read one central catalog. Catalog records support multiple collections, apparel/books/bundles, reusable media, scheduling, publication/availability state, variants, Stripe Price lookup keys, explicit mission-support eligibility, Give One eligibility, and revision conflict protection.

The browser never supplies the authoritative amount charged. Checkout resolves the current product and variant, loads the active Stripe Price by approved lookup key, and confirms the Stripe amount matches the catalog amount before opening Checkout.

Product/collection IDs and historical order snapshots are preserved so later catalog edits do not rewrite past commerce or Give One obligations.

## Stripe webhook

Production endpoint:

```text
https://YOUR-DOMAIN/.netlify/functions/stripe-webhook
```

The repository handles the required Checkout success/failure/expiration, refund, and dispute lifecycle events. The webhook verifies Stripe signatures before updating privacy-minimized event receipts and resumable order workflows.

Current payment/accountability design is documented in [`docs/PAYMENT-ACCOUNTABILITY-INTEGRITY.md`](docs/PAYMENT-ACCOUNTABILITY-INTEGRITY.md).

## Give One

Each eligible paid unit produces the configured deterministic Give One obligation. The human-facing claim code is random but maps to that immutable obligation. Retries verify/repair required mappings rather than silently issuing duplicate obligations.

Refunds/disputes suspend or cancel only obligations supported by authoritative payment/allocation facts. Redeemed/fulfilled history is preserved.

## Church campaign and batch fulfillment

Supported campaign fulfillment modes:

- `individual_shipping`
- `church_batch`
- `hybrid`

Church-pickup orders use the campaign’s configured pickup/delivery location and do not receive the normal individual-shipping charge. Paid pickup items are assembled into production batches; direct-shipping orders and Give One redemptions remain separate.

When a batch is received at the church, linked orders become `ready_for_pickup`, not `ready_to_ship`. Pickup handoff and any reversal/exception are attributable administrative actions.

See [`docs/CHURCH-BATCH-FULFILLMENT.md`](docs/CHURCH-BATCH-FULFILLMENT.md).

## Mission accountability

The accountability model distinguishes commerce, ministry support, Give One, operations, payment reconciliation, and append-only ledger corrections.

Admin v2 separates:

```text
accountability.write
accountability.approve
accountability.lock_period
```

Payment reconciliation and refund allocation use preview → durable request → recent-authenticated approval/apply. The approver re-checks current source facts and order revision before mutation. Reporting-period locks are separately authorized and audited.

## Media and teaching resources

Media is governed by usage, rights, product-accuracy, and contextual eligibility. The canonical administrator action is **Choose from Media Library**.

Uploads use signature/MIME/extension checks, size/dimension/container rules, quarantine, metadata stripping/re-encoding where practical, active-content rejection, and optional fail-closed malware scanning for documents.

Stored files are not automatically public; public access remains controlled by the applicable media/content/teaching rules.

## Admin v2 security controls

The administrative gateway provides:

- OIDC authorization code + PKCE/state/nonce validation through `openid-client`;
- verified-email and MFA assurance validation;
- named invited administrator records;
- hashed opaque server-side sessions with idle/absolute expiration and revocation;
- centralized RBAC on every administrative function;
- CSRF and origin validation for mutations;
- recent authentication for sensitive actions;
- server-side rate limiting;
- append-only attributable HMAC/hash-chain audit history;
- no-store administrative responses;
- restrictive Admin-specific CSP;
- server-side pagination/masking/detail reveal;
- bounded audited exports; and
- hardened uploads.

The legacy shared-token module is deliberately fail-closed and CI rejects any administrative function that imports it.

## Deployment and rollback

Follow [`docs/ADMIN-V2-MIGRATION.md`](docs/ADMIN-V2-MIGRATION.md). A secure rollback must never restore shared-token administration. If authentication/session integrity is in doubt, rotate the Admin session secret to invalidate all sessions while keeping public commerce independent.

## Validation evidence

GitHub Actions runs:

1. production dependency audit at high-severity threshold;
2. full unit/regression/security tests;
3. recursive syntax checks;
4. Playwright Chromium acceptance at the required desktop/tablet/mobile viewport sizes; and
5. screenshot/trace artifact upload for Admin v2 browser evidence.

Do not merge an Admin v2 pull request while a launch-blocking security, browser, regression, or configuration acceptance gate remains unresolved.
