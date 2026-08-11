import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import {
  approveAccountabilityRequest,
  createAccountabilityApprovalRequest
} from './_shared/accountability-admin-service.mjs';
import { hasPermission } from './_shared/admin-permissions.mjs';
import { readJsonBody, requiredExplanation } from './_shared/admin-request.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['POST'],
  permission: 'accountability.write',
  csrf: true,
  recentAuth: true,
  auditAction: 'accountability.request',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 250_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const approveNow = payload.approveNow === true;
  if (approveNow && !hasPermission(context.permissions, 'accountability.approve')) {
    throw Object.assign(new Error('Separate accountability approval permission is required to approve this action.'), { statusCode: 403 });
  }
  const reason = requiredExplanation(payload.reason || payload.entry?.note);
  const entryInput = { ...(payload.entry || {}) };
  entryInput.idempotencyKey = String(entryInput.idempotencyKey || request.headers.get('idempotency-key') || '').trim();
  if (!entryInput.idempotencyKey) {
    throw Object.assign(new Error('A stable idempotency key is required for every accountability action.'), { statusCode: 400 });
  }

  const approvalRequest = await createAccountabilityApprovalRequest(entryInput, context, reason);
  if (approveNow) {
    const approved = await approveAccountabilityRequest(approvalRequest.id, context, {
      reason,
      confirmSameActor: payload.confirmSameActor === true
    });
    return {
      response: json({ approvalRequest: approved.request, entry: approved.ledgerEntry }, 201),
      audit: {
        resourceType: 'accountability_approval',
        resourceId: approvalRequest.id,
        reason,
        afterSummary: {
          status: 'approved',
          ledgerEntryId: approved.ledgerEntry.id,
          sameActorOverride: Boolean(approved.request.sameActorOverride)
        }
      }
    };
  }

  return {
    response: json({ approvalRequest }, 202),
    audit: {
      resourceType: 'accountability_approval',
      resourceId: approvalRequest.id,
      reason,
      afterSummary: { status: 'pending', entryType: approvalRequest.entry.type, amount: approvalRequest.entry.amount }
    }
  };
});
