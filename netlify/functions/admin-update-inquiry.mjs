import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { readJsonBody } from './_shared/admin-request.mjs';
import { listInquiries, saveInquiry } from './_shared/campaign-service.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['POST'],
  permission: 'campaigns.write',
  csrf: true,
  recentAuth: false,
  auditAction: 'campaign_inquiry.update',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 250_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  if (!payload.inquiry?.id) throw Object.assign(new Error('Inquiry ID is required.'), { statusCode: 400 });
  const existing = (await listInquiries()).find((item) => item.id === payload.inquiry.id) || null;
  if (!existing) throw Object.assign(new Error('Inquiry not found.'), { statusCode: 404 });
  const inquiry = await saveInquiry({
    ...payload.inquiry,
    lastAdministrativeActorId: context.userId
  }, payload.expectedUpdatedAt || '');
  return {
    response: json({ inquiry }),
    audit: {
      resourceType: 'campaign_inquiry',
      resourceId: inquiry.id,
      reason: inquiry.notes || '',
      beforeSummary: existing,
      afterSummary: inquiry
    }
  };
});
