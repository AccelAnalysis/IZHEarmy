import { getStore } from '@netlify/blobs';
import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import {
  TEACHING_UPLOAD_TYPES,
  randomizedStorageId,
  validateQuarantinedUpload
} from './_shared/admin-upload-security.mjs';
import { cleanText, json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['POST'],
  permission: 'content.teaching.write',
  csrf: true,
  recentAuth: false,
  auditAction: 'teaching_file.upload',
  rateClass: 'upload',
  contentTypes: ['multipart/form-data'],
  maxBodyBytes: 6 * 1024 * 1024
}, async (request, context) => {
  const form = await request.formData();
  const file = form.get('file');
  const resourceId = cleanText(form.get('resourceId'), 100).toLowerCase();
  if (!resourceId) throw Object.assign(new Error('Enter the resource ID before uploading a file.'), { statusCode: 400 });

  let prepared;
  let id = '';
  try {
    prepared = await validateQuarantinedUpload(file, {
      allowedTypes: TEACHING_UPLOAD_TYPES,
      maxBytes: 5 * 1024 * 1024,
      maxWidth: 8_192,
      maxHeight: 8_192,
      maxPixels: 40_000_000,
      requireScannerForDocuments: process.env.IZHE_UPLOAD_REQUIRE_SCANNER_FOR_DOCUMENTS === 'true'
    });
    id = randomizedStorageId(prepared.storageExtension, 'teaching');
    const metadata = {
      resourceId,
      filename: prepared.filename,
      contentType: prepared.contentType,
      size: prepared.size,
      originalSize: prepared.originalSize,
      sha256: prepared.sha256,
      width: prepared.dimensions?.width || 0,
      height: prepared.dimensions?.height || 0,
      metadataStripped: prepared.metadataStripped,
      validationStatus: prepared.validationStatus,
      malwareScanStatus: prepared.scan.status,
      malwareScannedAt: prepared.scan.scannedAt,
      archiveEntries: prepared.archive?.entries || null,
      archiveUncompressedBytes: prepared.archive?.uncompressedBytes || null,
      createdAt: new Date().toISOString(),
      createdByAdministratorId: context.userId,
      accessStatus: 'unpublished'
    };
    const saved = await getStore('izhe-teaching-files').set(id, prepared.buffer, { metadata, onlyIfNew: true });
    if (!saved.modified) throw Object.assign(new Error('A unique teaching-file storage name could not be reserved.'), { statusCode: 409 });
    const fileRecord = {
      id,
      url: `/.netlify/functions/resource-file?id=${encodeURIComponent(id)}`,
      ...metadata
    };
    return {
      response: json({ file: fileRecord }, 201),
      audit: {
        resourceType: 'teaching_file',
        resourceId: id,
        afterSummary: {
          resourceId,
          filename: prepared.filename,
          contentType: prepared.contentType,
          size: prepared.size,
          width: metadata.width,
          height: metadata.height,
          metadataStripped: prepared.metadataStripped,
          malwareScanStatus: prepared.scan.status,
          validationStatus: prepared.validationStatus,
          accessStatus: 'unpublished'
        }
      }
    };
  } catch (error) {
    if (id) await getStore('izhe-teaching-files').delete(id).catch(() => {});
    throw error;
  } finally {
    await prepared?.release?.();
  }
});
