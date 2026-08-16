import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { listAccountabilityApprovalRequests } from './_shared/accountability-admin-service.mjs';
import { boundedInteger, text } from './_shared/admin-request.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['GET'],
  permission: 'accountability.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'accountability.approvals.read',
  rateClass: 'read'
}, async (request) => {
  const url = new URL(request.url);
  const items = await listAccountabilityApprovalRequests({
    status: text(url.searchParams.get('status'), 40),
    limit: boundedInteger(url.searchParams.get('limit'), 100, { min: 1, max: 500 })
  });
  return json({ items });
});
