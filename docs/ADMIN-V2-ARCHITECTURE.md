# IZHE Admin v2 — Architecture

## Purpose

Admin v2 replaces the former shared-token dashboard with a route-based administrative application that remains compatible with the existing static Netlify + Netlify Functions architecture. It does not change the public storefront business rules, Stripe pricing, Give One economics, fulfillment state machines, campaign records, or append-only accountability calculations.

## Runtime layers

### Browser application

Canonical route: `/admin/`

The browser application is native ES modules under `public/assets/admin-v2/` and includes:

- `app.js` — authenticated application shell and page dispatch.
- `api.js` — same-origin cookie/CSRF API client and server-generated downloads.
- `router.js` — deep-link routing and navigation guards.
- `permissions.js` — UI projection of the server permission registry.
- `state.js` — lightweight application state.
- `ui/` — reusable buttons, dialogs, dropdowns, tables, pagination, toast, form helpers, and Media Library picker.
- `pages/` — focused page modules for Overview, Catalog, Content, Operations, Campaigns, Accountability, and Administration.

No administrator credential is stored in browser storage. The only localStorage retained by the storefront is non-security application state such as the public cart. Admin v2 removes the obsolete `izhe-admin-token` key once as migration cleanup.

### Identity and session layer

Authentication uses a provider-neutral OpenID Connect authorization-code flow with PKCE. The identity provider performs primary authentication and MFA. IZHE validates issuer metadata, state, nonce, code exchange, verified email, and required MFA assurance before binding the identity to an invited administrator record.

IZHE-specific roles and status are stored in `izhe-admin-users`; they are not accepted from arbitrary identity-provider role claims.

After authentication, the browser receives only an opaque `__Host-izhe_admin_session` cookie. A hash of that opaque token identifies the server-side record in `izhe-admin-sessions`.

### Administrative gateway

`netlify/functions/_shared/admin-auth-v2.mjs` is the canonical protected-endpoint gateway. Each protected function declares:

- allowed methods;
- required permission;
- CSRF requirement;
- recent-authentication requirement;
- audit action;
- rate-limit class;
- accepted content types; and
- maximum body size.

The wrapper validates the session, account state, permission, origin, CSRF token, body policy, rate limit, and recent authentication before invoking business logic. Responses are `no-store` and carry request IDs.

`netlify/functions/_shared/admin-permissions.mjs` is the canonical permission and endpoint registry. Automated tests enumerate every `admin-*.mjs` function and fail if a protected function is absent or not wrapped.

### Business services

Existing catalog, payment, campaign, Give One, fulfillment, media, content, teaching, and accountability services remain authoritative for business rules. Admin v2 adds authorization boundaries around those services rather than duplicating or silently changing them.

High-risk financial mutations use durable request/review records and re-read authoritative source data immediately before the approved mutation.

## Durable administrative stores

Admin v2 uses Netlify Blobs conceptually organized as:

- `izhe-admin-users` — invited/active/suspended/disabled administrators and IZHE roles.
- `izhe-admin-sessions` — hashed opaque sessions, idle/absolute expiration, revocation, and recent-auth state.
- `izhe-admin-audit` — immutable append-only administrator audit events and integrity-chain head.
- `izhe-admin-rate-limits` — bounded server-side abuse/rate buckets.
- `izhe-admin-financial-actions` — payment reconciliation and refund-allocation approval requests.
- `izhe-accountability-approvals` — append-only accountability entry requests and decisions.
- `izhe-accountability-periods` — current reporting-period lock state.
- `izhe-accountability-period-events` — immutable lock/unlock history.
- upload quarantine/validation stores used by hardened media and teaching-file services.

Existing business stores remain unchanged in authority and meaning.

## Data-flow boundaries

### Overview

`admin-overview` returns counts, totals, alerts, and recent high-level activity only. It does not send full customer, code, order, redemption, batch, or finance collections.

### List and detail

`admin-list` returns permission-scoped, cursor-paginated, masked projections. `admin-detail` returns a complete authorized record only when the administrator explicitly opens it. This prevents hidden tabs or browser state from carrying broad PII unnecessarily.

### Exports

Exports are server-generated and require dedicated export permission. Broad/sensitive exports require recent authentication, explicit confirmation, explanation, and a bounded row/date scope. The export itself is audited.

## Route map

- `/admin/` — Overview
- `/admin/catalog/products` — Products
- `/admin/catalog/collections` — Collections
- `/admin/catalog/media` — Media Library
- `/admin/content/website` — Website Content
- `/admin/content/visual-editor` — Visual Editor
- `/admin/content/teaching` — Teaching Library
- `/admin/operations/orders` — Orders
- `/admin/operations/give-one` — Give One
- `/admin/operations/fulfillment` — Fulfillment
- `/admin/operations/production-batches` — Production Batches
- `/admin/operations/church-pickup` — Church Pickup
- `/admin/campaigns` — Campaigns
- `/admin/accountability` — Accountability
- `/admin/administration/users` — Administrators & Roles
- `/admin/administration/sessions` — Active Sessions
- `/admin/administration/audit` — Audit Log

`/admin.html` redirects to `/admin/`. The former standalone `/visual-editor.html` redirects to the Admin v2 Visual Editor. Netlify rewrites deep `/admin/*` routes to the same static shell.

## Legacy cutover

The shared-token implementation is retired. `_shared/admin-auth.mjs` is retained only as a fail-closed sentinel so a missed legacy import cannot revive shared-token authorization. The old token login UI, sequential `admin.js` loader, and token-bearing visual-editor/admin assets are removed from the final branch.

Public catalog/content/teaching preview endpoints and restricted resource/media access authorize through the named Admin v2 session when preview/restricted access is requested.

## Failure behavior

If required OIDC, session, or audit-signing configuration is absent:

- public commerce continues to use its existing public functions;
- administrative APIs reject access;
- `/admin/` reports a safe configuration failure;
- no shared-token fallback activates.

## Concurrency

Admin v2 preserves existing ETag/revision protections. Financial approval requests also capture expected revisions and revalidate them immediately before mutation. A stale request fails with a conflict and must be regenerated rather than silently overwriting newer data.
