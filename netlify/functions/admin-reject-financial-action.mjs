import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { getFinancialActionRequest, rejectFinancialActionRequest } from './_shared/admin-financial-action-service.mjs';
import { readJsonBody, requiredExplanation, text } from './_shared/admin-request.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['POST'],
  permission: 'accountability.approve',
  csrf: true,
  recentAuth: true,
  auditAction: 'financial_action.reject',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request, context) => {
  const body = await readJsonBody(request);
  const id = text(body.id, 200);
  const reason = requiredExplanation(body.reason);
  if (!id) throw Object.assign(new Error('A financial action request ID is required.'), { statusCode: 400 });
  const before = await getFinancialActionRequest(id);
  if (!before) throw Object.assign(new Error('Financial action request not found.'), { statusCode: 404 });
  const rejected = await rejectFinancialActionRequest(id, context, reason);
  return {
    response: json({ financialAction: rejected }),
    audit: {
      resourceType: 'financial_action',
      resourceId: id,
      reason,
      beforeSummary: before,
      afterSummary: rejected
    }
  };
});
