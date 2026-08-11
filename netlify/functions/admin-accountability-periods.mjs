import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { boundedInteger, text } from './_shared/admin-request.mjs';
import { getReportingPeriod, listReportingPeriodEvents, listReportingPeriods } from './_shared/accountability-period-service.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['GET'],
  permission: 'accountability.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'accountability.periods.read',
  rateClass: 'read'
}, async (request) => {
  const url = new URL(request.url);
  const period = text(url.searchParams.get('period'), 20);
  const limit = boundedInteger(url.searchParams.get('limit'), 120, { min: 1, max: 240 });
  const includeEvents = url.searchParams.get('includeEvents') === 'true';
  const periods = period ? [await getReportingPeriod(period)] : await listReportingPeriods({ limit });
  const events = includeEvents
    ? await listReportingPeriodEvents({ period, limit: boundedInteger(url.searchParams.get('eventLimit'), 200, { min: 1, max: 1_000 }) })
    : [];
  return {
    response: json({ periods, events }),
    audit: {
      resourceType: 'accountability_reporting_periods',
      resourceId: period || null,
      afterSummary: { periodCount: periods.length, eventCount: events.length }
    }
  };
});
