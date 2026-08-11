# IZHE Admin v2 — Acceptance Record

## Status

Admin v2 implementation, migration, security, regression, syntax, dependency, responsive-browser, and deploy-preview code gates are complete on the reviewed application head described below. The pull request must remain **draft and unmerged** until the external production identity-provider/MFA configuration and named-Owner production acceptance steps in this document are completed.

This record does not claim that a live OIDC provider has been configured or that production Owner login has been verified when those external actions have not occurred.

## Repository state

- Repository: `AccelAnalysis/IZHEarmy`
- Starting `main` SHA: `ee27c1a5c60f9f4f71a86a188b41cd197836d50f`
- Working branch: `feature/admin-v2-security-ux`
- Pull request: `#19 — IZHE Admin v2 — secure administration and operations portal modernization`
- Reviewed application/test head: `fbdd29d165325632c7dd89f8615acbaa26e11d36`
- GitHub Actions validation: run `31510030929` / run #264
- Netlify deploy-preview check on the reviewed head: success
- Browser-evidence artifact: `admin-v2-browser-evidence`, artifact ID `9108685159`
- Artifact SHA-256: `deeffb0d530977e87d76724956921c96caf18ed650b2cb25d9a49989d113896a`

Documentation-only commits made after the reviewed application head must also have green CI before final review. The PR remains draft until that current-head requirement and the external gates below are satisfied.

## Validation evidence

GitHub Actions run #264 used Node `24.18.0` and npm `11.16.0`.

| Command / gate | Result |
|---|---|
| `npm ci --no-audit --no-fund` | PASS — 69 packages installed from committed lockfile |
| `npm audit --omit=dev --audit-level=high` | PASS — `found 0 vulnerabilities` |
| `npm test` | PASS |
| `node --test tests/*.test.mjs` | PASS — 130 tests, 130 passed, 0 failed/skipped/cancelled |
| Payment-integrity syntax gate | PASS |
| `node scripts/check-javascript-syntax.mjs` | PASS — 193 JavaScript modules checked |
| `npx playwright install --with-deps chromium` | PASS |
| `npm run test:browser` | PASS — 10 tests passed |
| Netlify deploy-preview status | PASS |

The Playwright suite validates the required viewport sizes:

- 1920 × 1080
- 1440 × 900
- 1280 × 800
- 1024 × 768
- 768 × 1024
- 390 × 844

Browser tests cover the Admin v2 shell, horizontal-overflow constraints, mobile navigation, Products, Product editor, shared Media Library picker, Orders progressive filters, row-action keyboard behavior and focus restoration, Campaigns, Accountability, Administrators & Roles, Audit Log, and the mobile Filters affordance. Screenshot/report evidence is preserved in the browser-evidence artifact.

## Security acceptance

| Gate | Code/test status | Production acceptance status |
|---|---|---|
| Individual named administrator identities | PASS | Requires live provider/Owner login verification |
| Provider-enforced MFA plus `acr`/`amr` validation | PASS in implementation/tests | Requires live provider policy verification |
| OIDC authorization code, PKCE, state, nonce, verified email | PASS in implementation/tests | Requires live callback/login verification |
| Shared `IZHE_ADMIN_TOKEN` cannot authorize Admin v2 | PASS — legacy authenticator fails closed and coverage scan passes | Old Netlify secret should be removed after secure production cutover |
| No browser-stored administrator bearer credential | PASS | Verify production browser storage after deploy |
| Secure opaque server-backed session | PASS | Verify production cookie attributes after live login |
| Idle/absolute expiration and revocation | PASS in implementation/tests | Exercise against live provider/session deployment |
| Server permission declaration for protected admin endpoints | PASS | Verify representative role behavior after live login |
| CSRF/origin/method/content-type/body-size protection | PASS in implementation/tests | Exercise representative production mutations |
| Recent authentication for high-risk actions | PASS | Verify provider step-up flow in production |
| Separation of accountability write/approve/period-lock authority | PASS | Assign intended production roles and exercise approval path |
| Append-only attributable audit history and integrity verification | PASS | Verify live login/mutation events and chain status |
| Server-side rate limiting | PASS in implementation/tests | Observe deployed enforcement |
| No-store Admin responses | PASS | Verify deployed headers |
| Restrictive Admin CSP; no runtime Tailwind CDN | PASS | Verify deployed headers/browser console |
| Hardened upload validation/quarantine | PASS | Production document scanning requires scanner configuration |
| Restricted preview/resource access uses named session | PASS | Verify authenticated/unauthenticated production behavior |
| Production dependency audit at high severity | PASS — 0 vulnerabilities | Complete |

## Information architecture and UX acceptance

- Canonical route is `/admin/`; `/admin.html` redirects to Admin v2.
- The former standalone `/visual-editor.html` redirects to `/admin/content/visual-editor`.
- Deep Admin routes rewrite to the Admin v2 application shell.
- Persistent left navigation replaces the wrapping top-tab model.
- Permission-inaccessible sections are hidden while server authorization remains authoritative.
- Admin v2 uses a clean light full-width application shell and local system-font/CSS/JS assets.
- Operations is separated into Orders, Give One, Fulfillment, Production Batches, and Church Pickup.
- Desktop filters use progressive disclosure and **More Filters**; active filters render as chips; mobile uses a **Filters** affordance.
- Row actions use accessible **More Actions** menus.
- Full sensitive records load on demand instead of being preloaded into Overview/list state.
- The shared action label is exactly **Choose from Media Library**.
- Product duplication is server-authoritative, permission-protected, audited, source-preserving, and creates a `draft` + `paused` copy with regenerated/reset identity, SKU, Stripe lookup, variant-identity, publication-history, and operational fields.
- The Visual Editor uses structured server-owned schemas, shared media selection, correct `baseRevision + changes` draft/publication semantics, and same-origin validated live preview messaging without URL/browser-storage credentials.
- Accessibility/browser acceptance covers navigation landmarks, keyboard menus, focus restoration, dialogs, mobile navigation, and representative responsive views.

## Data/API acceptance

- `admin-overview` returns aggregate counts/totals/alerts/activity rather than complete customer/order collections.
- `admin-list` provides cursor pagination, server search/filter/sort, and minimized/masked projections.
- `admin-detail` reveals the authorized full record only on explicit request.
- Operational, pickup, campaign, accountability, batch, and audit exports are server-generated and permission-scoped; sensitive exports require recent authentication, explicit confirmation, explanation, and bounded output.
- Production Batch export has the dedicated `operations.batches.export` permission.
- Payment reconciliation and refund allocation use preview → durable request → separate recent-authenticated approval/apply and reject stale revisions before mutation.
- Accountability ledger corrections remain append-only and serialized; reporting periods have separately authorized immutable lock/unlock events.
- Existing Stripe catalog prices/lookup semantics, Give One economics, fulfillment state machines, campaign records, order/redemption records, church-pickup behavior, and public teaching rules are not intentionally rewritten by Admin v2.

## Regression acceptance

The 130-test unit/regression/security suite includes existing coverage for:

- Stripe and payment-integrity calculations;
- deterministic Give One obligations and redemption behavior;
- refund/dispute/payment reconciliation;
- product/collection catalog validation and revision behavior;
- campaigns and support formulas;
- church-batch assembly and partial allocation;
- church-pickup readiness, handoff, reversal/exception behavior;
- production batch lifecycle and post-submission reconciliation alerts;
- mission accountability and append-only ledger rules;
- structured content publication windows;
- visual-layout governed presets;
- teaching schedules/access relationships;
- media governance/product accuracy; and
- Admin v2 security, endpoint inventory, CSP, OIDC primitives, duplication, Media Library, and upload hardening.

No failing test was disabled to reach this acceptance state.

## External production launch gates — still required

These steps cannot be satisfied by repository code alone and must be completed against the organization’s chosen identity/security services and live Netlify context before PR #19 leaves draft:

1. Select/configure a maintained OIDC provider and enable mandatory MFA for every IZHE administrator.
2. Register the exact production callback URL: `https://izhe.org/.netlify/functions/admin-oidc-callback` (and any isolated acceptance callback that is actually used).
3. Configure the Admin v2 Netlify environment variables listed in `.env.example`, including independent session and audit-signing secrets. Do not place secret values in GitHub.
4. Configure an HTTPS malware scanner for document/teaching uploads and keep `IZHE_UPLOAD_REQUIRE_SCANNER_FOR_DOCUMENTS=true` for production document uploads.
5. Set the narrow initial `IZHE_ADMIN_BOOTSTRAP_EMAILS` allowlist, perform the first named Owner login with MFA, verify the durable Owner/provider-subject binding, then remove/blank the bootstrap allowlist.
6. In production, verify the `__Host-izhe_admin_session` cookie attributes, session idle/absolute expiration, logout, single/all-session revocation, role-based 401/403 behavior, CSRF/origin rejection, recent-auth step-up, audit attribution/integrity, and authenticated vs unauthenticated preview/resource access.
7. Verify representative existing public commerce behavior after the Admin v2 deployment: storefront/catalog, Stripe checkout/webhook processing, Give One, campaigns, content/teaching, church-batch fulfillment, pickup, and accountability views.
8. After secure Owner access is verified, delete/rotate the legacy `IZHE_ADMIN_TOKEN` Netlify environment variable if it still exists. The Admin v2 code does not honor it, but it should be removed from secret inventory.
9. Confirm directly that presenting the former shared token as a bearer credential cannot authorize any production administrative request.
10. Re-run/record the production acceptance evidence, then update the PR and only then consider moving it out of draft. Do not merge as part of this implementation pass.

## Rollback rule

A rollback must never restore the old shared-token administration path. Roll back only to a secure Admin v2 commit or disable administrator access at the identity provider while preserving public commerce. If session integrity is in doubt, rotate the Admin session secret to invalidate all active sessions. Preserve audit, approval, and financial-history stores through rollback.

## Decision

**In-repository launch blockers: resolved and verified on the reviewed application head.**

**Production launch blocker remaining: external OIDC/MFA/scanner configuration plus named-Owner/live-environment acceptance.**

Until those external gates pass, PR #19 must remain **draft, open, and unmerged**.
