import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { listAdminAuditEvents, verifyAuditEvent } from './_shared/admin-audit-service.mjs';
import { boundedInteger, text } from './_shared/admin-request.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['GET'],
  permission: 'administration.audit.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'audit.read',
  rateClass: 'read'
}, async (request) => {
  const url = new URL(request.url);
  const cursor = boundedInteger(url.searchParams.get('cursor'), null, { min: 1 });
  const result = await listAdminAuditEvents({
    dateFrom: text(url.searchParams.get('dateFrom'), 40),
    dateTo: text(url.searchParams.get('dateTo'), 40),
    actorUserId: text(url.searchParams.get('actorUserId'), 200),
    action: text(url.searchParams.get('action'), 160),
    resourceType: text(url.searchParams.get('resourceType'), 120),
    resourceId: text(url.searchParams.get('resourceId'), 240),
    result: text(url.searchParams.get('result'), 40),
    beforeSequence: cursor,
    limit: boundedInteger(url.searchParams.get('limit'), 50, { min: 1, max: 200 })
  });
  return json({
    items: result.items.map((event) => ({ ...event, integrityValid: verifyAuditEvent(event) })),
    hasMore: result.hasMore,
    nextCursor: result.nextCursor
  });
});
