import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { revokeCurrentSession } from './_shared/admin-session-service.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['POST'],
  permission: 'overview.read',
  csrf: true,
  recentAuth: false,
  auditAction: 'session.logout',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 10_000
}, async (request, context) => {
  const revoked = await revokeCurrentSession(request, context, 'logout');
  return {
    response: json({ ok: true }, 200, { 'set-cookie': revoked.clearCookie }),
    audit: {
      resourceType: 'administrator_session',
      resourceId: revoked.session?.id || context.sessionId,
      afterSummary: { revoked: true, reason: 'logout' }
    }
  };
});
