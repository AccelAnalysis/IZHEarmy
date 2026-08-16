import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { hasPermission } from './_shared/admin-permissions.mjs';
import { boundedInteger, text } from './_shared/admin-request.mjs';
import { listAdminSessions, publicSession } from './_shared/admin-session-service.mjs';
import { getAdminUser, publicAdminUser } from './_shared/admin-user-service.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['GET'],
  permission: 'overview.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'sessions.read',
  rateClass: 'read'
}, async (request, context) => {
  const url = new URL(request.url);
  const canManage = hasPermission(context.permissions, 'administration.sessions.manage');
  const requestedUserId = text(url.searchParams.get('userId'), 200);
  const userId = canManage && requestedUserId ? requestedUserId : context.userId;
  const includeRevoked = canManage && url.searchParams.get('includeRevoked') === 'true';
  const limit = boundedInteger(url.searchParams.get('limit'), 50, { min: 1, max: 200 });
  const records = (await listAdminSessions({ userId, includeRevoked })).slice(0, limit);
  const users = new Map();
  for (const record of records) {
    if (!users.has(record.userId)) users.set(record.userId, publicAdminUser(await getAdminUser(record.userId)));
  }
  const sessions = records.map((record) => ({
    ...publicSession(record, { currentSessionId: context.sessionId }),
    administrator: users.get(record.userId) || null
  }));
  return json({ sessions, canManage, scopedUserId: userId });
});
