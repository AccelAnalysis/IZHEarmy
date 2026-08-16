import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { verifyAdminAuditChain } from './_shared/admin-audit-service.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['GET'],
  permission: 'administration.audit.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'audit.verify',
  rateClass: 'read'
}, async () => {
  const verification = await verifyAdminAuditChain();
  return {
    response: json(verification, verification.valid ? 200 : 409),
    audit: {
      resourceType: 'administrator_audit_chain',
      resourceId: verification.headEventId,
      result: verification.valid ? 'success' : 'failure',
      afterSummary: verification
    }
  };
});
