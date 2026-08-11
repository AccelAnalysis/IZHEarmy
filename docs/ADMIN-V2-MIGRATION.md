# IZHE Admin v2 — Migration, Deployment, and Rollback

## Scope

This runbook cuts production administration from the retired `IZHE_ADMIN_TOKEN` browser-bearer model to named OIDC identities and server-side sessions. Public commerce remains available independently of Admin v2 configuration.

## Pre-deployment requirements

1. Choose a maintained OpenID Connect provider.
2. Require MFA for every administrator identity at the provider.
3. Create the IZHE administration OIDC client.
4. Register the exact callback URL:

   `https://YOUR-DOMAIN/.netlify/functions/admin-oidc-callback`

5. If a deploy-preview acceptance environment will be used with isolated/non-production data, register that exact callback separately.
6. Configure the Netlify environment variables listed in `.env.example`.
7. Generate independent high-entropy values for session and audit signing secrets.
8. Configure `IZHE_ADMIN_BOOTSTRAP_EMAILS` with only the first Owner’s verified email address(es).
9. Configure the document malware scanner and `IZHE_UPLOAD_REQUIRE_SCANNER_FOR_DOCUMENTS=true` before production document uploads.
10. Do **not** add a new `IZHE_ADMIN_TOKEN`; it is retired.

## Provider configuration checklist

- Authorization code flow enabled.
- PKCE supported/required.
- Redirect URI exact match.
- Verified email claim available.
- MFA policy enforced.
- `acr` or `amr` assurance available and mapped to `IZHE_ADMIN_REQUIRED_ACR` as appropriate.
- Account disable/revocation path documented.
- Client secret stored only in provider/Netlify secret configuration.

## Non-production acceptance

Deploy the draft branch to an isolated acceptance context and verify:

1. `/admin/` shows safe configuration failure when OIDC variables are absent.
2. Public catalog, checkout, campaign, teaching, and Give One endpoints remain available when Admin v2 is unconfigured.
3. OIDC login begins from `/admin/` without a browser bearer credential.
4. State, nonce, PKCE and callback processing succeed.
5. An uninvited identity is rejected without an account-enumeration message.
6. A verified invited Owner signs in with MFA.
7. The response cookie is `__Host-izhe_admin_session; Secure; HttpOnly; SameSite=Strict; Path=/` with no Domain.
8. Idle, absolute, logout, single-session revoke, and revoke-all behavior work.
9. Role projection and direct server authorization return the expected 401/403 boundaries.
10. Cross-origin and CSRF-invalid mutations fail.
11. Sensitive actions trigger recent authentication.
12. Audit events show the named administrator and pass integrity verification.
13. Product duplication creates a paused draft with regenerated identity/Stripe fields.
14. Media picker behavior is consistent across modules.
15. Public preview/teaching restricted access works through the session and fails when unauthenticated.
16. Existing Stripe, Give One, campaign, fulfillment, church-pickup, content, teaching, and accountability regression tests remain green.

## Initial Owner bootstrap

1. Set `IZHE_ADMIN_BOOTSTRAP_EMAILS` to the smallest possible verified-email allowlist.
2. Sign in through the configured OIDC provider with MFA.
3. Confirm the durable Owner record is created and provider subject is bound.
4. Sign out and sign back in to prove durable-account authorization no longer depends on bootstrap matching.
5. Remove `IZHE_ADMIN_BOOTSTRAP_EMAILS` from the production environment or leave it blank.
6. Confirm the Owner still signs in.
7. Confirm the bootstrap creation/login events in Audit Log.

## Production cutover

1. Confirm the exact PR head has green CI, including unit/security/syntax/browser tests and dependency audit.
2. Review the browser-evidence artifact and required viewport screenshots.
3. Deploy that exact commit to production.
4. Verify `/admin.html` redirects to `/admin/`.
5. Verify `/visual-editor.html` redirects to `/admin/content/visual-editor`.
6. Verify deep Admin v2 routes refresh successfully.
7. Sign in as the named Owner with MFA.
8. Verify cookie attributes in browser developer tools.
9. Verify one read and one safe mutation in each permitted administrative domain.
10. Verify Audit Log attribution and integrity status.
11. Verify public storefront checkout and current public content independently.
12. Delete/rotate the old `IZHE_ADMIN_TOKEN` environment variable if it still exists. The deployed code does not honor it, but it should be removed from secret inventory.
13. Revoke any old browser/session access by clearing legacy browser state and using Admin v2 session controls.
14. Confirm that presenting the former token as a bearer credential cannot authorize any administrative endpoint.

## Legacy asset cutover

The final Admin v2 branch removes the old sequential admin loader and token-bearing admin/visual-editor scripts. Public catalog/content/teaching preview scripts use same-origin cookie sessions when preview access is requested.

Do not restore the old files as a rollback mechanism.

## Rollback strategy

Security rollback must not re-enable shared-token administration.

If a production defect is found after cutover:

1. Disable the affected Admin v2 mutation capability or temporarily restrict administrator access at the OIDC provider.
2. Keep public commerce online if unaffected.
3. Revert only the faulty Admin v2 feature to the previous secure Admin v2 commit where possible.
4. If session/authentication behavior is suspect, rotate `IZHE_ADMIN_SESSION_SECRET` to invalidate all sessions and require fresh MFA login.
5. Preserve audit stores and financial/action request stores; do not delete them to simplify rollback.
6. Do not roll back to a commit that honors `IZHE_ADMIN_TOKEN`.
7. Re-run regression/security/browser tests before redeployment.
8. Record the incident and corrective deployment in the normal change process.

## Post-cutover verification

Within the first production operating period:

- review Administrator & Roles for unexpected accounts;
- confirm only intended Owner(s);
- inspect Active Sessions;
- verify denied-attempt/rate-limit events are reasonable;
- review exports and financial approvals;
- verify the audit chain;
- confirm no application error logs contain tokens, cookies, OIDC codes, or secrets;
- confirm public storefront metrics/order flow remain normal; and
- remove any temporary deploy-preview/acceptance callback URLs no longer required.

## Environment variables

See `.env.example` for names and safe examples. Secret values must never be committed to GitHub, documentation, screenshots, PR comments, or audit metadata.
