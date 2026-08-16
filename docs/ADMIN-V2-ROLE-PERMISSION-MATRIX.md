# IZHE Admin v2 — Role and Permission Matrix

## Principles

- Permissions are enforced server-side; UI visibility is only a convenience.
- Administrators may hold multiple roles.
- Owner is the emergency/full-authority role, not the routine default for every administrator.
- Financial request, approval, and reporting-period lock authority are intentionally separable.
- The final active Owner cannot be removed or demoted.
- Sensitive role/status changes revoke or invalidate existing sessions.

## Roles

| Role | Primary scope | Publish | Financial write | Financial approve | Period lock | User/role admin | Audit |
|---|---|---:|---:|---:|---:|---:|---:|
| Owner | All administration | Yes | Yes | Yes | Yes | Yes | Yes |
| Operations Administrator | Orders, Give One, fulfillment, batches, pickup | No | No | No | No | No | No |
| Catalog and Content Editor | Catalog, media, website, teaching drafts | No by default | No | No | No | No | No |
| Publisher | Catalog/content publication | Yes | No | No | No | No | No |
| Campaign Administrator | Inquiries, campaigns, campaign pickup/reporting | Campaign publish | No | No | No | No | No |
| Finance and Accountability Administrator | Reporting, entry requests, payment review, exports | No | Yes | No | No | No | No |
| Accountability Approver | Independent accountability/financial approval | No | No | Yes | No | No | No |
| Accountability Period Manager | Reporting-period locks/unlocks | No | No | No | Yes | No | No |
| Auditor / Read Only | Read-only operations/accountability/audit | No | No | No | No | No | Yes |

## Permission groups

### Overview

- `overview.read`

### Catalog

- `catalog.collections.read`
- `catalog.collections.write`
- `catalog.collections.publish`
- `catalog.products.read`
- `catalog.products.write`
- `catalog.products.publish`
- `catalog.products.duplicate`

### Media

- `media.read`
- `media.upload`
- `media.manage`

### Website and teaching content

- `content.website.read`
- `content.website.write`
- `content.website.publish`
- `content.website.preview`
- `content.teaching.read`
- `content.teaching.write`
- `content.teaching.publish`
- `content.teaching.preview`

### Operations

- `operations.orders.read`
- `operations.orders.write`
- `operations.orders.export`
- `operations.give_one.read`
- `operations.give_one.write`
- `operations.give_one.export`
- `operations.fulfillment.read`
- `operations.fulfillment.write`
- `operations.batches.read`
- `operations.batches.write`
- `operations.batches.export`
- `operations.pickup.read`
- `operations.pickup.write`
- `operations.pickup.export`

### Campaigns

- `campaigns.read`
- `campaigns.write`
- `campaigns.publish`
- `campaigns.export`

### Accountability

- `accountability.read`
- `accountability.write`
- `accountability.approve`
- `accountability.export`
- `accountability.lock_period`

### Administration

- `administration.users.read`
- `administration.users.manage`
- `administration.roles.manage`
- `administration.sessions.manage`
- `administration.audit.read`

The executable source of truth is `netlify/functions/_shared/admin-permissions.mjs`. Automated tests reject role permissions that are not in the registry.

## Lifecycle procedures

### Invite an administrator

1. Open **Administration → Administrators & Roles**.
2. Choose **Invite Administrator**.
3. Enter the verified-email identity expected from the OIDC provider.
4. Assign only the required role(s).
5. Save. The user remains `invited` until successful provider authentication binds the provider subject.
6. Confirm the invitation event in Audit Log.

### Change roles

1. Open the administrator record.
2. Review current roles and active sessions.
3. Perform recent authentication when prompted.
4. Add/remove only the permissions required for the job.
5. Confirm the change and required explanation where presented.
6. Verify session invalidation/revocation and the audit event.

### Suspend or disable

Use **suspended** for temporary denial and **disabled** for a durable access stop. Either state is rejected at session validation. Revoke all active sessions after status change and review recent audit history.

### Revoke sessions

Open **Active Sessions**. Revoke a single session when a device/session is suspect; revoke all sessions for account-wide containment. Revoking another administrator’s session requires recent authentication.

### Compromised account

Suspend/disable the administrator, revoke all sessions, disable the upstream identity account, review Audit Log and high-risk records, then follow the incident-response procedure in `ADMIN-V2-SECURITY-MODEL.md`.

### Final Owner protection

The server rejects a role/status change that would leave IZHE without an active Owner. Create and verify another Owner before demoting/disabling the last one.

## Periodic access review

At least quarterly, Owner or delegated governance staff should:

- review all active/invited administrators;
- remove stale invitations;
- confirm roles still match job responsibilities;
- review recent login/session activity;
- review Owner membership;
- review export and financial-approval events; and
- record remediation through normal audited Admin v2 actions.
