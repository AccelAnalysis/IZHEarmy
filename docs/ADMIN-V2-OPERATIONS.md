# IZHE Admin v2 — Operations Guide

## Sign in and session behavior

Open `/admin/` and sign in through the configured identity provider. MFA is required. Admin v2 does not accept the former shared token.

The application signs an administrator out when the server-side session expires or is revoked. Sensitive actions may require a new MFA-backed authentication even when the normal session is still active.

## Overview

Overview is intentionally lightweight. It shows aggregate counts, high-value alerts, and recent attributable activity without loading full customer records. Use the relevant workspace for detail.

## Catalog

### Products

Use the Products table for search, collection, publication, availability, and product-type filtering. Open **More Actions** for row actions.

**Duplicate** creates a safe draft copy. The server copies reusable merchandising/media/variant structure while regenerating or resetting identity, SKU, Stripe lookup, publication-history, and operational fields. Duplicates start `draft` + `paused` and open in the editor.

Publishing controls are shown only to users with publish authority and remain server-enforced.

### Collections

Collections use the same list/editor, status, availability, media-selection, and revision-conflict patterns as Products.

### Media Library

The canonical action everywhere is **Choose from Media Library**. Asset eligibility depends on usage approval, rights, product accuracy, and the current context. Ineligible assets show the reason.

Uploads are quarantined and validated before release. A successful upload is not automatically public.

## Content

### Website Content

Structured content uses revision-aware draft/save/publish controls. Text is rendered as text in Admin v2 rather than executed as arbitrary markup.

### Visual Editor

The Visual Editor is inside Admin v2. Its preview is same-origin and uses the HttpOnly administrator session. Credentials are never passed in URL parameters or postMessage payloads. Incoming frame messages are restricted by origin, source, type, and version.

### Teaching Library

Teaching records and files preserve existing public/restricted access semantics. Administrator-only files require Admin v2 authorization. Document uploads may require the configured malware scanner.

## Operations

Operations are split into focused routes rather than one overloaded dashboard.

### Orders

Use search plus common status controls first. Lower-frequency filters are under **More Filters** and active criteria appear as removable chips. Full customer details are fetched only when **View Details** is opened.

Church-pickup orders must not be treated as direct-shipping orders. Generic order status changes remain bounded by the existing fulfillment rules.

### Give One

The list masks claim codes; authorized detail loads the complete record on demand. Code creation/update/reissue continues to use the existing Give One rules. High-volume generation requires recent authentication.

### Fulfillment

This route focuses direct-shipping/general fulfillment. Use Church Pickup for pickup handoff.

### Production Batches

Batch creation/update preserves existing production and campaign rules. Submitted/later production history is not silently rewritten to make a refund/cancellation appear clean.

### Church Pickup

Use this route for campaign pickup orders. Supported lifecycle states include awaiting batch, allocated, in production, ready for pickup, picked up, exception, and other supported terminal/correction states.

Pickup handoff records the releaser, recipient, timestamp, and note. Reversal requires the normal corrective workflow and note. Roster exports require dedicated permission, recent authentication, explicit confirmation, explanation, and bounded output.

## Campaigns

Campaigns retain current support formula, campaign product/collection restrictions, pickup configuration, and church-batch behavior. Publishing/unpublishing requires publish permission.

## Accountability

The workspace separates organization/campaign totals, ledger actions, financial approvals, and reporting periods.

### Entry request

A Finance/Accountability administrator may create an append-only entry request using `accountability.write`. The request remains pending until a user with `accountability.approve` approves it, unless the explicitly confirmed sole-Owner exception applies.

### Payment reconciliation

1. Run **Preview** to read authoritative Stripe/order facts.
2. Review differences and campaign attribution.
3. Submit a durable approval request with explanation.
4. An approver reviews and applies it after recent authentication.
5. The server re-reads the order/Stripe state and rejects a stale request.

This reconciler repairs local records; it does not create refunds, capture payments, or modify Stripe catalog/pricing.

### Refund allocation

Refund allocation follows the same preview → request → approve/apply pattern. Allocation history remains append-only; corrections are reversals, not overwrites.

### Reporting periods

A reporting-period manager may lock/unlock periods. Unlocking is sensitive and requires recent authentication and explanation. Financial entry approval validates the period at approval time as well as request time.

## Administration

### Administrators & Roles

Invite only verified-email identities. Assign minimum necessary roles. Sensitive role/status changes require recent authentication. The final active Owner cannot be removed/demoted.

### Active Sessions

Review device/browser summary, creation, activity, and expiration. Revoke a suspicious session or all sessions for an account. Revoking another user’s session requires recent authentication.

### Audit Log

Audit Log is read-only. Filter by date, actor, action, resource, or result. Integrity verification should be green before relying on the chain as complete evidence. Export requires authorization and recent authentication.

## Exports

Exports are generated server-side. They do not depend on rendering thousands of browser rows. Sensitive exports require:

- dedicated permission;
- recent authentication;
- explicit confirmation;
- written reason;
- bounded date/row scope; and
- audit event.

CSV fields are protected against spreadsheet formula injection and filenames are sanitized.

## Conflict handling

A `409` indicates the record changed since the administrator’s view/request. Reload current state and intentionally repeat the operation; do not bypass revision checks.

## Common access errors

- `401` — session missing/expired/revoked; sign in again.
- `403` — authenticated but role does not allow the action, or recent authentication is required.
- `409` — revision/concurrency conflict.
- `429` — administrative rate limit; retry after the indicated interval.
- `503` configuration error — Admin v2 identity/session configuration is incomplete. Public commerce should remain available.

Every server error includes a request ID suitable for safe operational correlation without exposing secrets.
