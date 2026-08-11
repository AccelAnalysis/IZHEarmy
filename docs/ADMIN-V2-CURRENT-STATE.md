# IZHE Admin v2 — Current State and Threat Model

**Inventory date:** 2026-08-11  
**Starting `main` SHA:** `ee27c1a5c60f9f4f71a86a188b41cd197836d50f`  
**Baseline command:** `npm test`  
**Baseline evidence:** the documentation-only branch commit is used to establish a GitHub Actions baseline against the same application code. The run result is recorded in `docs/ADMIN-V2-ACCEPTANCE.md` before implementation gates are closed.

## Executive finding

The current administration layer authenticates every administrator with one value from `IZHE_ADMIN_TOKEN`. The browser stores the value under `izhe-admin-token`, attaches it as an `Authorization: Bearer` header, and shares it with the administration dashboard, visual editor, content preview, and administrator-only resource access. `requireAdmin()` compares the presented value directly to the environment variable. The current UI is a dark, Tailwind-CDN page assembled by a sequential loader that appends more than twenty scripts at runtime.

This creates five launch-blocking classes of risk:

1. **No attributable identity.** All actions appear to come from the same credential.
2. **Credential exposure and replay.** A long-lived bearer secret is readable by JavaScript and persisted in browser storage.
3. **No server-enforced separation of duties.** Any holder receives every administrative capability.
4. **No session revocation or assurance boundary.** There is no named-account lifecycle, MFA validation, idle timeout, recent-authentication check, or account-wide revocation.
5. **High browser data exposure.** Several administration payloads load complete catalog, media, order, redemption, code, batch, campaign, and finance collections into one page.

Admin v2 replaces this model with provider-neutral OIDC authentication, named IZHE administrator records, opaque server-side sessions, centralized RBAC, CSRF/origin protection, append-only attributable audit history, minimized paginated APIs, and a modular light administrative application.

## Search inventory

The starting-state inventory searched for:

- `IZHE_ADMIN_TOKEN`
- `izhe-admin-token`
- `requireAdmin`
- `isAdmin`
- `authorization`
- `Bearer`
- `localStorage`
- `sessionStorage`
- `admin-`
- `contentPreview`
- `visualFrame`

Confirmed browser token consumers include the legacy admin application, visual editor, structured-content loader, teaching-resource access, and preview integrations. Confirmed server consumers include the administrative catalog, content, media, teaching, campaigns, operations, Give One, fulfillment, pickup, batch, payment-integrity, finance, export, and resource-file paths.

## Administrative workflow matrix

| Administrative page or workflow | Frontend entry point | Server function or functions | Current authentication | Data sensitivity | Mutation | Required Admin v2 permission | Migration status |
|---|---|---|---|---|---:|---|---|
| Dashboard / catalog aggregate | `public/admin.html`, `admin-part-*.js` | `admin-catalog.mjs`, `admin-data.mjs` | Shared bearer token | Catalog plus broad operations aggregate | No | `overview.read`, catalog and operations read projections | Not started |
| Collections list/detail | Legacy Collections tab | `admin-catalog.mjs` | Shared bearer token | Public/draft merchandising records | No | `catalog.collections.read` | Not started |
| Create/update collections | Legacy collection form | `admin-save-collection.mjs` | Shared bearer token | Draft/published catalog | Yes | `catalog.collections.write`; publish action separated | Not started |
| Products list/detail | Legacy Products tab | `admin-catalog.mjs` | Shared bearer token | Draft product, price, Stripe lookup metadata | No | `catalog.products.read` | Not started |
| Create/update products | Legacy product form | `admin-save-product.mjs` | Shared bearer token | Catalog, SKU, Stripe lookup metadata | Yes | `catalog.products.write`; publish action separated | Not started |
| Product duplication | Not implemented | New Admin v2 endpoint | None | Catalog identity and Stripe metadata | Yes | `catalog.products.duplicate` | Not started |
| Media Library list | Legacy Media tab and multiple pickers | `admin-catalog.mjs`, media service | Shared bearer token | Asset metadata, rights and editorial state | No | `media.read` | Not started |
| Upload media | Legacy upload controls | `admin-upload-media.mjs` | Shared bearer token | Binary upload and metadata | Yes | `media.upload` | Not started |
| Edit media metadata | Legacy media editor | `admin-update-media.mjs` | Shared bearer token | Rights, approval, product-accuracy metadata | Yes | `media.manage` | Not started |
| Website content | Priority 4 admin additions | `admin-content-data.mjs`, `admin-save-content.mjs` | Shared bearer token | Draft and scheduled site content | Yes | `content.website.read`, `.write`, `.publish` | Not started |
| Visual editor | `visual-editor*.js`, admin launcher | `admin-visual-editor.mjs` | Shared bearer token | Unpublished page drafts and preview controls | Yes | `content.website.preview`, `.write`, `.publish` | Not started |
| Teaching Library | `learn.js`, Priority 4 admin additions | `admin-teaching-data.mjs`, `admin-save-teaching.mjs` | Shared bearer token | Public and restricted books, chapters, files | Yes | `content.teaching.read`, `.write`, `.publish`, `.preview` | Not started |
| Teaching file upload | Teaching editor | `admin-upload-teaching-file.mjs` | Shared bearer token | Potentially restricted downloadable files | Yes | `content.teaching.write` | Not started |
| Administrator-only resource retrieval | `learn.js`, preview/editor clients | `resource-file.mjs` | Shared bearer token in some access paths | Restricted binary resource | No | Context-specific teaching/content permission | Not started |
| Orders list/detail | Legacy Operations tab | `admin-data.mjs` | Shared bearer token | Customer PII, payment and fulfillment state | No | `operations.orders.read` | Not started |
| Update order | Legacy Operations controls | `admin-update-order.mjs` | Shared bearer token | Customer order and state-machine data | Yes | `operations.orders.write` | Not started |
| Give One codes | Legacy Operations tab | `admin-data.mjs`, `admin-create-codes.mjs`, `admin-update-code.mjs` | Shared bearer token | Codes, eligibility, issuance and status | Yes | `operations.give_one.read`, `.write`; recent auth for bulk creation | Not started |
| Redemptions | Legacy Operations tab | `admin-data.mjs`, `admin-update-redemption.mjs` | Shared bearer token | Recipient PII, code and fulfillment linkage | Yes | `operations.give_one.read`, `.write` | Not started |
| General fulfillment | Legacy Operations tab | `admin-update-order.mjs` and shared fulfillment services | Shared bearer token | Shipping/pickup state and tracking | Yes | `operations.fulfillment.read`, `.write` | Not started |
| Production batches | Legacy Operations tab / church batch script | `admin-save-batch.mjs`, `admin-build-church-batch.mjs` | Shared bearer token | Vendor, item, campaign and production state | Yes | `operations.batches.read`, `.write` | Not started |
| Church pickup queue and handoff | Legacy church-batch additions | `admin-pickup-order.mjs`, `admin-pickup-roster.mjs` | Shared bearer token | Pickup codes, names, contact details, handoff state | Yes | `operations.pickup.read`, `.write`, `.export` | Not started |
| Redemption export | Legacy dashboard export | `admin-export.mjs` | Shared bearer token | Broad customer and redemption PII | No | Dedicated operations export permission plus recent auth | Not started |
| Campaign list/detail | Campaign admin additions | `admin-campaign-data.mjs` | Shared bearer token | Church contacts, campaign settings and reporting | No | `campaigns.read` | Not started |
| Campaign create/update | Campaign admin additions | `admin-save-campaign.mjs` | Shared bearer token | Campaign, pickup and support settings | Yes | `campaigns.write`; publish separated | Not started |
| Inquiry update | Campaign admin additions | `admin-update-inquiry.mjs` | Shared bearer token | Church/ministry contact information | Yes | `campaigns.write` | Not started |
| Campaign report/export | Campaign admin additions | `admin-campaign-report.mjs` | Shared bearer token | Roster, sales, support and fulfillment reporting | No | `campaigns.export`; recent auth for broad PII | Not started |
| Finance/accountability aggregate | Priority 4 finance admin | `admin-finance-data.mjs` | Shared bearer token | Ledger, support, payment and adjustment data | No | `accountability.read` | Not started |
| Ledger entry / correction | Priority 4 finance admin | `admin-save-ledger-entry.mjs` | Shared bearer token | Append-only financial correction data | Yes | `accountability.write`; approval separately enforced | Not started |
| Finance export | Priority 4 finance admin | `admin-finance-export.mjs` | Shared bearer token | Financial and campaign accountability data | No | `accountability.export`; recent auth | Not started |
| Payment reconciliation | Payment-integrity admin additions | `admin-reconcile-payment.mjs` | Shared bearer token | Stripe and order references | Yes | `accountability.write` and, where applicable, `.approve` | Not started |
| Refund allocation | Payment-integrity admin additions | `admin-allocate-refund.mjs` | Shared bearer token | Refund and support allocation data | Yes | `accountability.write` and approval boundary | Not started |
| Payment migration report | Payment-integrity admin additions | `admin-payment-migration-report.mjs` | Shared bearer token | Historical order/payment integrity findings | No | `accountability.read` | Not started |
| Administrators and roles | Not implemented | New Admin v2 endpoints | None | Identity, role and status data | Yes | `administration.users.read/manage`, `administration.roles.manage` | Not started |
| Active sessions | Not implemented | New Admin v2 endpoints | None | Device, activity and expiration metadata | Yes | `administration.sessions.manage` | Not started |
| Audit Log | Not implemented | New Admin v2 endpoints | None | Attributable administrative action history | No | `administration.audit.read` | Not started |

## Current application assembly

`public/assets/admin.js` is a sequential loader that appends the legacy admin parts one at a time. The resulting application has shared global state, ordering dependencies, duplicate interaction vocabularies, and no route-level code or data boundaries. Admin v2 will use native ES modules, a small router, reusable components, and page-specific data loading.

## Current security control summary

| Control | Starting state | Admin v2 target |
|---|---|---|
| Administrator identity | Shared token | Named invitation-only user bound to OIDC subject |
| MFA | None validated by IZHE | Enforced by provider and required `amr`/`acr` assurance |
| Browser credential | Persistent localStorage bearer token | `Secure`, `HttpOnly`, `SameSite=Strict`, `__Host-` session cookie |
| Session store | None | Hashed opaque IDs in `izhe-admin-sessions` |
| Authorization | All-or-nothing `isAdmin()` | Central permissions and multi-role RBAC on every endpoint |
| CSRF | Not applicable to bearer model; no cookie protection | Session-associated token plus Origin validation on mutations |
| Recent authentication | None | Required for role changes, broad exports, approvals, unlocks, and bulk actions |
| Audit | Operational records only; no attributable admin log | Append-only `izhe-admin-audit` events with HMAC/hash chain |
| Data minimization | Broad aggregate loads | Overview projections, cursor pagination, masked lists, on-demand detail |
| Rate limiting | No canonical admin control | Server-side login/read/write/upload/export/bulk limits |
| Admin CSP | Global minimal policy; Admin loads CDN Tailwind | Route-specific self-hosted CSP and no runtime CDN dependencies |
| Upload validation | Module-specific checks | Shared signature/MIME/extension/size/dimension/metadata policy |
| Failure mode | Token comparison; variable absence denies | OIDC/session configuration fails closed; no token fallback |

## Preserved business invariants

Admin v2 must not modify Stripe prices or lookup keys, Give One economics or issuance rules, checkout validation, existing order/redemption/campaign/batch records, fulfillment state machines, church-pickup semantics, append-only financial correction calculations, storefront availability semantics, public teaching access semantics, or existing ETag/revision concurrency protections.

## Migration sequence

1. Add provider-neutral OIDC, administrator records, secure sessions, permissions, audit, CSRF, rate limits, and endpoint wrapper.
2. Migrate every protected function, including preview and resource access, and add an automated coverage test.
3. Split overview/list/detail/export projections and apply pagination and masking.
4. Build Admin v2 shell and reusable controls.
5. Migrate Catalog, shared Media Library picker, and product duplication.
6. Migrate Content, Visual Editor, Teaching, Operations, Campaigns, Accountability, Administration, Sessions, and Audit.
7. Apply route-specific CSP, upload hardening, responsive/browser tests, legacy-token removal, and final cutover.
