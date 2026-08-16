import { getStore } from '@netlify/blobs';
import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { hasPermission } from './_shared/admin-permissions.mjs';
import {
  MEDIA_UPLOAD_TYPES,
  randomizedStorageId,
  validateQuarantinedUpload
} from './_shared/admin-upload-security.mjs';
import { cleanText, json } from './_shared/http.mjs';
import { createUploadedMediaRecord, mediaUrl } from './_shared/media-service.mjs';

export default adminEndpoint({
  methods: ['POST'],
  permission: 'media.upload',
  csrf: true,
  recentAuth: false,
  auditAction: 'media.upload',
  rateClass: 'upload',
  contentTypes: ['multipart/form-data'],
  maxBodyBytes: 6 * 1024 * 1024
}, async (request, context) => {
  const form = await request.formData();
  const file = form.get('file');
  let prepared;
  let storedId = '';
  try {
    prepared = await validateQuarantinedUpload(file, {
      allowedTypes: MEDIA_UPLOAD_TYPES,
      maxBytes: 5 * 1024 * 1024,
      maxWidth: 8_192,
      maxHeight: 8_192,
      maxPixels: 40_000_000,
      requireScannerForDocuments: false
    });
    storedId = randomizedStorageId(prepared.storageExtension, 'media');
    const createdAt = new Date().toISOString();
    const binaryMetadata = {
      filename: prepared.filename,
      contentType: prepared.contentType,
      size: prepared.size,
      originalSize: prepared.originalSize,
      width: prepared.dimensions?.width || 0,
      height: prepared.dimensions?.height || 0,
      sha256: prepared.sha256,
      metadataStripped: prepared.metadataStripped,
      validationStatus: prepared.validationStatus,
      malwareScanStatus: prepared.scan.status,
      malwareScannedAt: prepared.scan.scannedAt,
      createdAt,
      createdByAdministratorId: context.userId
    };
    const store = getStore('izhe-media');
    const saved = await store.set(storedId, prepared.buffer, { metadata: binaryMetadata, onlyIfNew: true });
    if (!saved.modified) throw Object.assign(new Error('A unique media storage name could not be reserved.'), { statusCode: 409 });

    const canManage = hasPermission(context.permissions, 'media.manage');
    const requestedUsageStatus = cleanText(form.get('usageStatus'), 40);
    const usageStatus = canManage ? (requestedUsageStatus || 'draft') : 'draft';
    const record = await createUploadedMediaRecord(storedId, {
      filename: binaryMetadata.filename,
      title: form.get('title') || binaryMetadata.filename,
      alt: form.get('alt'),
      category: form.get('category'),
      usageStatus,
      rightsStatus: form.get('rightsStatus'),
      productAccuracyStatus: form.get('productAccuracyStatus'),
      tags: form.get('tags'),
      credit: form.get('credit'),
      notes: form.get('notes'),
      recommendedUse: form.get('recommendedUse'),
      focalPoint: form.get('focalPoint'),
      width: binaryMetadata.width,
      height: binaryMetadata.height,
      orientation: form.get('orientation'),
      sourceType: 'admin_upload',
      createdAt
    });
    const media = {
      id: storedId,
      url: mediaUrl(storedId),
      static: false,
      ...binaryMetadata,
      ...record
    };
    return {
      response: json({ media }, 201),
      audit: {
        resourceType: 'media_asset',
        resourceId: storedId,
        afterSummary: {
          filename: prepared.filename,
          contentType: prepared.contentType,
          size: prepared.size,
          width: binaryMetadata.width,
          height: binaryMetadata.height,
          usageStatus: record.usageStatus,
          rightsStatus: record.rightsStatus,
          productAccuracyStatus: record.productAccuracyStatus,
          metadataStripped: prepared.metadataStripped,
          malwareScanStatus: prepared.scan.status,
          validated: true
        }
      }
    };
  } catch (error) {
    if (storedId) await getStore('izhe-media').delete(storedId).catch(() => {});
    throw error;
  } finally {
    await prepared?.release?.();
  }
});
