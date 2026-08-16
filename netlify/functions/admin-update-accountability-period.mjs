import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { changeReportingPeriod } from './_shared/accountability-period-service.mjs';
import { readJsonBody, requiredExplanation, text } from './_shared/admin-request.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['POST'],
  permission: 'accountability.lock_period',
  csrf: true,
  recentAuth: true,
  auditAction: 'accountability.period.update',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request, context) => {
  const body = await readJsonBody(request);
  const action = body.action === 'unlock' ? 'unlock' : body.action === 'lock' ? 'lock' : '';
  if (!action) throw Object.assign(new Error('Choose lock or unlock.'), { statusCode: 400 });
  if (body.confirm !== true) throw Object.assign(new Error('Explicit confirmation is required to change a reporting-period lock.'), { statusCode: 400 });
  const reason = requiredExplanation(body.reason);
  const result = await changeReportingPeriod({
    period: text(body.period, 20),
    action,
    reason,
    expectedRevision: body.expectedRevision,
    context
  });
  return {
    response: json({ period: result.period, event: result.event }),
    audit: {
      resourceType: 'accountability_reporting_period',
      resourceId: result.period.period,
      reason,
      beforeSummary: result.before,
      afterSummary: result.period,
      metadata: { action, eventId: result.event.eventId }
    }
  };
});
