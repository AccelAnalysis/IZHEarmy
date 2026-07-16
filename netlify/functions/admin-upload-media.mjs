import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { cleanText, json, methodNotAllowed } from './_shared/http.mjs';
import { createUploadedMediaRecord, mediaUrl } from './_shared/media-service.mjs';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  let storedId = '';
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function' || typeof file.type !== 'string') return json({ error: 'Choose an image to upload.' }, 400);
    if (!ALLOWED.has(file.type)) return json({ error: 'Upload a JPG, PNG, or WebP image.' }, 400);
    if (file.size < 1 || file.size > 5 * 1024 * 1024) return json({ error: 'Images must be 5 MB or smaller.' }, 400);
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    storedId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.${extension}`;
    const createdAt = new Date().toISOString();
    const binaryMetadata = {
      filename: cleanText(file.name, 180),
      contentType: file.type,
      size: file.size,
      createdAt
    };
    const store = getStore('izhe-media');
    await store.set(storedId, file, { metadata: binaryMetadata, onlyIfNew: true });
    const record = await createUploadedMediaRecord(storedId, {
      filename: binaryMetadata.filename,
      title: form.get('title') || binaryMetadata.filename,
      alt: form.get('alt'),
      category: form.get('category'),
      usageStatus: form.get('usageStatus'),
      rightsStatus: form.get('rightsStatus'),
      productAccuracyStatus: form.get('productAccuracyStatus'),
      tags: form.get('tags'),
      credit: form.get('credit'),
      notes: form.get('notes'),
      recommendedUse: form.get('recommendedUse'),
      focalPoint: form.get('focalPoint'),
      width: form.get('width'),
      height: form.get('height'),
      orientation: form.get('orientation'),
      sourceType: 'admin_upload',
      createdAt
    });
    return json({ media: { id: storedId, url: mediaUrl(storedId), static: false, ...binaryMetadata, ...record } }, 201);
  } catch (error) {
    if (storedId) await getStore('izhe-media').delete(storedId).catch(() => {});
    console.error('admin-upload-media', error);
    return json({ error: error.message || 'The image could not be uploaded.' }, error.statusCode || 400);
  }
};
