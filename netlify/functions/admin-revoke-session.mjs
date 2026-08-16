import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { clearSessionCookie } from './_shared/admin-crypto.mjs';
import { hasPermission } from './_shared/admin-permissions.mjs';
import { readJsonBody, requiredExplanation, text } from './_shared/admin-request.mjs';
import {
  listAdminSessions,
  revokeSessionById,
  revokeUserSessions
} from './_shared/admin-session-service.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['POST'],
  permission: 'overview.read',
  csrf: true,
  recentAuth: true,
  auditAction: 'session.revoke',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request, context) => {
  const body = await readJsonBody(request);
  const reason = requiredExplanation(body.reason);
  const mode = body.mode === 'all' ? 'all' : 'one';
  const canManage = hasPermission(context.permissions, 'administration.sessions.manage');

  if (mode === 'all') {
    const targetUserId = text(body.userId, 200) || context.userId;
    if (targetUserId !== context.userId && !canManage) {
      throw Object.assign(new Error('Session-management permission is required to revoke another administrator’s sessions.'), { statusCode: 403 });
    }
    const revoked = await revokeUserSessions(targetUserId, context, reason);
    const clearsCurrent = targetUserId === context.userId;
    return {
      response: json({ ok: true, revokedSessions: revoked }, 200, clearsCurrent ? { 'set-cookie': clearSessionCookie() } : {}),
      audit: {
        resourceType: 'administrator_sessions',
        resourceId: targetUserId,
        reason,
        afterSummary: { revokedSessions: revoked, scope: 'all' }
      }
    };
  }

  const sessionId = text(body.sessionId, 200);
  if (!sessionId) throw Object.assign(new Error('A session ID is required.'), { statusCode: 400 });
  const target = (await listAdminSessions({ includeRevoked: true })).find((session) => session.id === sessionId);
  if (!target) throw Object.assign(new Error('Administrator session not found.'), { statusCode: 404 });
  if (target.userId !== context.userId && !canManage) {
    throw Object.assign(new Error('Session-management permission is required to revoke another administrator’s session.'), { statusCode: 403 });
  }
  if (target.revokedAt) throw Object.assign(new Error('The administrator session is already revoked.'), { statusCode: 409 });
  const revoked = await revokeSessionById(sessionId, context, reason);
  const clearsCurrent = sessionId === context.sessionId;
  return {
    response: json({ ok: true, sessionId, revokedAt: revoked?.revokedAt || null }, 200, clearsCurrent ? { 'set-cookie': clearSessionCookie() } : {}),
    audit: {
      resourceType: 'administrator_session',
      resourceId: sessionId,
      reason,
      beforeSummary: { userId: target.userId, createdAt: target.createdAt, revokedAt: target.revokedAt },
      afterSummary: { revokedAt: revoked?.revokedAt || null }
    }
  };
});
