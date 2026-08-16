import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { clearSessionCookie } from './_shared/admin-crypto.mjs';
import { readJsonBody, requiredExplanation, text } from './_shared/admin-request.mjs';
import { revokeUserSessions } from './_shared/admin-session-service.mjs';
import { getAdminUser, publicAdminUser, updateAdminUser } from './_shared/admin-user-service.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['POST'],
  permission: 'administration.roles.manage',
  csrf: true,
  recentAuth: true,
  auditAction: 'administrator.update',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request, context) => {
  const body = await readJsonBody(request);
  const userId = text(body.userId, 200);
  const existing = await getAdminUser(userId);
  if (!existing) throw Object.assign(new Error('Administrator not found.'), { statusCode: 404 });
  if (body.status === 'active' && !existing.providerSubject) {
    throw Object.assign(new Error('An invited administrator becomes active only after a verified OIDC login.'), { statusCode: 409 });
  }

  const reason = requiredExplanation(body.reason);
  const before = publicAdminUser(existing);
  const { user, sensitiveChange } = await updateAdminUser(userId, {
    displayName: body.displayName === undefined ? undefined : text(body.displayName, 160),
    status: body.status,
    roles: body.roles
  }, context);

  let revokedSessions = 0;
  if (sensitiveChange) {
    revokedSessions = await revokeUserSessions(user.id, context, `Administrator access changed: ${reason}`);
  }
  const headers = sensitiveChange && user.id === context.userId
    ? { 'set-cookie': clearSessionCookie() }
    : {};
  const after = publicAdminUser(user);
  return {
    response: json({ user: after, revokedSessions }, 200, headers),
    audit: {
      resourceType: 'administrator',
      resourceId: user.id,
      reason,
      beforeSummary: before,
      afterSummary: { ...after, revokedSessions }
    }
  };
});
