import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import {
  approveAccountabilityRequest,
  getAccountabilityApprovalRequest,
  rejectAccountabilityRequest
} from './_shared/accountability-admin-service.mjs';
import { readJsonBody, requiredExplanation, text } from './_shared/admin-request.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['POST'],
  permission: 'accountability.approve',
  csrf: true,
  recentAuth: true,
  auditAction: 'accountability.review',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request, context) => {
  const body = await readJsonBody(request);
  const id = text(body.id, 200);
  const action = body.action === 'reject' ? 'reject' : 'approve';
  const reason = requiredExplanation(body.reason);
  const before = await getAccountabilityApprovalRequest(id);
  if (!before) throw Object.assign(new Error('Accountability approval request not found.'), { statusCode: 404 });

  if (action === 'reject') {
    const rejected = await rejectAccountabilityRequest(id, context, reason);
    return {
      response: json({ approvalRequest: rejected }),
      audit: {
        resourceType: 'accountability_approval',
        resourceId: id,
        reason,
        beforeSummary: before,
        afterSummary: rejected
      }
    };
  }

  const approved = await approveAccountabilityRequest(id, context, {
    reason,
    confirmSameActor: body.confirmSameActor === true
  });
  return {
    response: json({ approvalRequest: approved.request, entry: approved.ledgerEntry }),
    audit: {
      resourceType: 'accountability_approval',
      resourceId: id,
      reason,
      beforeSummary: before,
      afterSummary: { ...approved.request, ledgerEntryId: approved.ledgerEntry.id }
    }
  };
});
