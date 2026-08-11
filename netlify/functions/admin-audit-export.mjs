import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { listAdminAuditEvents } from './_shared/admin-audit-service.mjs';
import { boundedInteger, readJsonBody, requiredExplanation, text } from './_shared/admin-request.mjs';

function csvCell(value) {
  const textValue = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return `"${String(textValue).replaceAll('"', '""').replace(/[\r\n]+/g, ' ')}"`;
}

function parseDate(value, label) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) throw Object.assign(new Error(`${label} must be a valid date.`), { statusCode: 400 });
  return date;
}

export default adminEndpoint({
  methods: ['POST'],
  permission: 'administration.audit.read',
  csrf: true,
  recentAuth: true,
  auditAction: 'audit.export',
  rateClass: 'export',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request) => {
  const body = await readJsonBody(request);
  const from = parseDate(body.dateFrom, 'dateFrom');
  const to = parseDate(body.dateTo, 'dateTo');
  if (to < from) throw Object.assign(new Error('dateTo must be on or after dateFrom.'), { statusCode: 400 });
  if (to.getTime() - from.getTime() > 31 * 24 * 60 * 60 * 1000) {
    throw Object.assign(new Error('Audit exports are limited to a 31-day date range.'), { statusCode: 400 });
  }
  const reason = requiredExplanation(body.reason);
  const maxRows = boundedInteger(body.maxRows, 5_000, { min: 1, max: 5_000 });
  const filters = {
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
    actorUserId: text(body.actorUserId, 200),
    action: text(body.action, 160),
    resourceType: text(body.resourceType, 120),
    resourceId: text(body.resourceId, 240),
    result: text(body.result, 40)
  };

  const events = [];
  let beforeSequence = null;
  while (events.length < maxRows) {
    const page = await listAdminAuditEvents({
      ...filters,
      beforeSequence,
      limit: Math.min(200, maxRows - events.length)
    });
    events.push(...page.items);
    if (!page.hasMore || !page.nextCursor) break;
    beforeSequence = Number(page.nextCursor);
  }

  const columns = [
    'sequence', 'eventId', 'timestamp', 'requestId', 'actorUserId', 'actorEmail', 'actorDisplayName',
    'actorRoles', 'action', 'resourceType', 'resourceId', 'result', 'reason', 'beforeSummary',
    'afterSummary', 'sourceIpHash', 'userAgentSummary', 'previousEventHash', 'eventHash'
  ];
  const lines = [columns.map(csvCell).join(',')];
  for (const event of events) lines.push(columns.map((column) => csvCell(event[column])).join(','));
  const filename = `izhe-admin-audit-${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}.csv`;
  return {
    response: new Response(`${lines.join('\r\n')}\r\n`, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store'
      }
    }),
    audit: {
      resourceType: 'administrator_audit_export',
      resourceId: filename,
      reason,
      afterSummary: { rowCount: events.length, dateFrom: filters.dateFrom, dateTo: filters.dateTo, bounded: true }
    }
  };
});
