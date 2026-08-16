import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { readJsonBody, text } from './_shared/admin-request.mjs';
import { json } from './_shared/http.mjs';
import { getMediaItem, saveMediaMetadata } from './_shared/media-service.mjs';
import { mediaMayBePublished } from './_shared/media-rules.mjs';

export default adminEndpoint({
  methods: ['POST'],
  permission: 'media.manage',
  csrf: true,
  recentAuth: false,
  auditAction: 'media.update',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 250_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const id = text(payload.id, 200);
  if (!id) throw Object.assign(new Error('Select a media asset to update.'), { statusCode: 400 });
  const existing = await getMediaItem(id);
  if (!existing) throw Object.assign(new Error('The selected media asset no longer exists.'), { statusCode: 404 });
  if (payload.expectedUpdatedAt && existing.updatedAt !== payload.expectedUpdatedAt) {
    throw Object.assign(new Error('This media record changed in another session. Refresh and retry.'), { statusCode: 409 });
  }
  const media = await saveMediaMetadata(id, {
    ...(payload.metadata || {}),
    reviewedByAdministratorId: context.userId
  });
  return {
    response: json({ media }),
    audit: {
      resourceType: 'media_asset',
      resourceId: id,
      reason: String(payload.reason || media.notes || '').slice(0, 1_000),
      beforeSummary: {
        title: existing.title,
        usageStatus: existing.usageStatus,
        rightsStatus: existing.rightsStatus,
        productAccuracyStatus: existing.productAccuracyStatus,
        publiclyEligible: mediaMayBePublished(existing)
      },
      afterSummary: {
        title: media.title,
        usageStatus: media.usageStatus,
        rightsStatus: media.rightsStatus,
        productAccuracyStatus: media.productAccuracyStatus,
        publiclyEligible: mediaMayBePublished(media)
      }
    }
  };
});
