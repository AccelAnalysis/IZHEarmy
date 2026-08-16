# IZHE Admin v2 — Security Model

## Security objectives

Admin v2 is designed to provide named administrator accountability, MFA-backed authentication, server-side authorization, revocable sessions, least privilege, separation of duties, CSRF/origin protection, sensitive-data minimization, hardened uploads, and tamper-evident audit history while preserving existing commerce behavior.

## Authentication

### Identity provider

IZHE uses a maintained OpenID Connect provider configured through environment variables. The provider must support authorization code + PKCE, verified email, signed tokens/JWKS, account disablement, and enforced MFA.

Required configuration names are documented in `.env.example`. Secrets are never committed.

### OIDC validation

The server validates:

- issuer/discovery metadata;
- exact client/audience relationship;
- authorization `state`;
- `nonce`;
- PKCE verifier/challenge;
- authorization-code exchange;
- token expiration/signature through the maintained OIDC library;
- verified email; and
- configured MFA assurance from `acr`/`amr` where supplied.

Administrator registration is invitation-only. First successful login binds the verified identity-provider subject to a pending IZHE invitation. Uninvited, unverified, suspended, and disabled identities are rejected.

## Sessions

Cookie: `__Host-izhe_admin_session`

Required attributes:

- `Secure`
- `HttpOnly`
- `SameSite=Strict`
- `Path=/`
- no `Domain`

The opaque token contains at least 256 bits of secure randomness. Only its hash is stored server-side. Default controls are:

- idle expiration: 30 minutes;
- absolute duration: 8 hours;
- recent-authentication window: 10 minutes;
- bounded activity-touch interval to avoid writes on every trivial read.

Sessions are rejected when expired, revoked, or when the underlying administrator becomes suspended/disabled or its session version changes. Logout clears the cookie and revokes the server record. Administrators with the required authority can revoke one or all sessions.

## Authorization and least privilege

`admin-permissions.mjs` defines canonical permissions and roles. The browser uses the same strings only to hide inaccessible UI; the server independently enforces every protected action.

Every administrative function must either:

1. use `adminEndpoint(...)` with a declared permission; or
2. be an explicitly enumerated login/session bootstrap route.

A CI test enumerates `admin-*.mjs` functions and rejects unregistered or legacy-auth endpoints.

## CSRF and origin controls

Cookie-authenticated mutations require:

- same-origin `Origin` validation;
- narrowly allowed `Referer` fallback where needed;
- session-associated CSRF token;
- allowed method;
- expected content type; and
- bounded request size.

The client sends the CSRF token in `x-izhe-csrf-token`. It is not an administrator credential and does not replace server-side session validation.

## Recent authentication

High-risk actions require a recently verified MFA-backed authentication. Examples include:

- role or status changes;
- adding/removing Owner authority;
- revoking another administrator’s session;
- high-volume Give One creation;
- broad customer/pickup/financial/audit exports;
- financial approval/application; and
- reporting-period unlocks.

When the sole Owner must exercise both request and approval authority, the action additionally requires explicit same-actor confirmation and a written explanation recorded in audit history.

## Financial separation of duties

Accountability creation, approval, and period locking are distinct permissions:

- `accountability.write`
- `accountability.approve`
- `accountability.lock_period`

The default Finance and Accountability Administrator does not automatically receive approval authority. An Accountability Approver and Accountability Period Manager role are available for explicit separation.

Payment reconciliation and refund allocation follow preview → durable request → separate approval/apply. The approver re-reads current Stripe/order facts and expected revision immediately before mutation. Stale requests fail closed with conflict.

## Audit integrity

Administrative actions create immutable events in `izhe-admin-audit`. Events include named actor, role snapshot, request ID, safe session reference, action, resource, result, reason, redacted before/after summaries, minimized network reference, user-agent summary, previous-event hash, and event HMAC/hash.

Application APIs provide read/verify/export only. There is no update/delete endpoint for audit events. Integrity verification checks each event signature and chain linkage to the stored head.

Never audit raw:

- cookies;
- OIDC authorization codes;
- ID/access/refresh tokens;
- client secrets;
- session tokens;
- Stripe secrets; or
- unnecessary complete PII.

## Rate limiting

Server-side rate classes protect authentication, reads, writes, uploads, exports, bulk operations, and repeated denied requests. Rate-limit failures return `429` without revealing account existence.

## Administrative data minimization

- Overview returns aggregates only.
- Lists are server-filtered, cursor-paginated projections.
- Email, phone, pickup codes, financial references, and tracking state are masked or reduced where appropriate.
- Full detail is returned only after an authorized reveal.
- Sensitive exports require explicit permission, recent authentication, bounds, confirmation, explanation, and audit.

## Upload security

The shared upload-security layer:

- checks file signatures/magic bytes;
- reconciles declared MIME, detected type, and extension;
- enforces size and image-dimension limits;
- checks ZIP/container decompression ratio, traversal, and macros;
- rejects SVG without sanitization;
- rejects active-content PDF constructs;
- decodes/re-encodes supported images to strip metadata where practical;
- uses randomized storage names;
- quarantines before release;
- supports an HTTPS malware-scanner service for documents; and
- fails closed for document scanning when `IZHE_UPLOAD_REQUIRE_SCANNER_FOR_DOCUMENTS=true`.

Existence in storage does not make a file public. Public availability still depends on the media/teaching access rules.

## CSP and browser hardening

Admin v2 uses route-specific no-store headers and a self-hosted CSP. Administrator scripts, styles, fonts, connections, frames, and images are restricted to same-origin sources plus required `data:`/`blob:` image/worker cases. Admin v2 has no runtime Tailwind CDN or third-party admin font/icon JavaScript.

The public storefront keeps its existing brand/runtime behavior except where secure preview authentication was changed from bearer storage to the HttpOnly session.

## Fail-closed legacy behavior

`IZHE_ADMIN_TOKEN` is retired. Production code does not compare or honor it. The legacy auth module returns denial only, and CI scans production browser assets for token/localStorage/bearer authentication patterns.

If identity/session configuration is incomplete, Admin v2 is unavailable; no fallback is enabled.

## Incident response

### Suspected administrator compromise

1. Disable or suspend the named administrator record.
2. Revoke all of that administrator’s sessions.
3. Disable/revoke the identity-provider account or credentials.
4. Review the Audit Log by actor, session reference, time, action, export, and resource.
5. Review high-risk downstream records (publishing, Give One, fulfillment, financial actions, role changes).
6. Rotate the Admin session secret if session-system compromise is suspected. This invalidates all sessions.
7. Rotate the audit-signing secret only under controlled incident procedure; preserve the old key and chain verification evidence for historical validation.
8. Rotate OIDC client secret if provider-client compromise is suspected.
9. Rotate any separate upload-scanner API key if exposed.
10. Document containment, impact, corrective action, and final verification.

### Shared-token retirement incident

If an old `IZHE_ADMIN_TOKEN` value remains configured in Netlify, it has no authorization effect after Admin v2 deployment. Remove/rotate it after production Admin v2 acceptance to reduce secret inventory.

## Secret rotation

- OIDC client secret: rotate in provider and Netlify together; verify login before deleting old secret where provider overlap is supported.
- Session secret: replacing it intentionally invalidates existing sessions; plan a maintenance notice for administrators.
- Audit signing secret: treat as an integrity-key rotation with explicit change record and retained verification metadata.
- Malware-scanner API key: rotate independently; required document uploads fail closed while scanner configuration is unavailable.

## Security verification

`tests/admin-v2-security.test.mjs` verifies cookie attributes, endpoint coverage, legacy-token removal, public preview authorization integration, local module integrity, CSP, OIDC library primitives, product duplication controls, and upload hardening. Browser acceptance tests verify representative navigation, filters, menu keyboard behavior, media picker consistency, and responsive rendering.
