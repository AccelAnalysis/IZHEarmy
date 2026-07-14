import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { cleanText, json, methodNotAllowed } from './_shared/http.mjs';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function' || typeof file.type !== 'string') return json({ error: 'Choose an image to upload.' }, 400);
    if (!ALLOWED.has(file.type)) return json({ error: 'Upload a JPG, PNG, or WebP image.' }, 400);
    if (file.size < 1 || file.size > 5 * 1024 * 1024) return json({ error: 'Images must be 5 MB or smaller.' }, 400);
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.${extension}`;
    const metadata = {
      filename: cleanText(file.name, 180),
      contentType: file.type,
      size: file.size,
      alt: cleanText(form.get('alt'), 240),
      createdAt: new Date().toISOString()
    };
    const store = getStore('izhe-media');
    await store.set(id, file, { metadata, onlyIfNew: true });
    return json({ media: { id, url: `/.netlify/functions/media?id=${encodeURIComponent(id)}`, ...metadata } }, 201);
  } catch (error) {
    console.error('admin-upload-media', error);
    return json({ error: error.message || 'The image could not be uploaded.' }, 400);
  }
};
