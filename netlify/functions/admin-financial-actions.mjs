import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { listFinancialActionRequests } from './_shared/admin-financial-action-service.mjs';
import { boundedInteger, text } from './_shared/admin-request.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['GET'],
  permission: 'accountability.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'financial_actions.read',
  rateClass: 'read'
}, async (request) => {
  const url = new URL(request.url);
  const items = await listFinancialActionRequests({
    status: text(url.searchParams.get('status'), 40),
    type: text(url.searchParams.get('type'), 80),
    limit: boundedInteger(url.searchParams.get('limit'), 100, { min: 1, max: 500 })
  });
  return {
    response: json({ items }),
    audit: {
      resourceType: 'financial_action_queue',
      resourceId: null,
      afterSummary: { returned: items.length }
    }
  };
});
