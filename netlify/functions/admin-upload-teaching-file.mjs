import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { cleanText, json, methodNotAllowed } from './_shared/http.mjs';

const ALLOWED = new Map([
  ['application/pdf', 'pdf'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['text/plain', 'txt'],
  ['audio/mpeg', 'mp3'],
  ['audio/mp4', 'm4a'],
  ['video/mp4', 'mp4'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const form = await request.formData();
    const file = form.get('file');
    const resourceId = cleanText(form.get('resourceId'), 100).toLowerCase();
    if (!resourceId) return json({ error: 'Enter the resource ID before uploading a file.' }, 400);
    if (!file || typeof file.arrayBuffer !== 'function' || typeof file.type !== 'string') return json({ error: 'Choose a teaching-resource file.' }, 400);
    const extension = ALLOWED.get(file.type);
    if (!extension) return json({ error: 'Upload a PDF, DOCX, PPTX, text, MP3, M4A, MP4, JPG, PNG, or WebP file.' }, 400);
    if (file.size < 1 || file.size > 5 * 1024 * 1024) return json({ error: 'Teaching files must be 5 MB or smaller. Use an external HTTPS URL for larger media.' }, 400);
    const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 10)}.${extension}`;
    const metadata = { resourceId, filename: cleanText(file.name, 180), contentType: file.type, size: file.size, createdAt: new Date().toISOString() };
    await getStore('izhe-teaching-files').set(id, file, { metadata, onlyIfNew: true });
    return json({ file: { id, url: `/.netlify/functions/resource-file?id=${encodeURIComponent(id)}`, ...metadata } }, 201);
  } catch (error) {
    console.error('admin-upload-teaching-file', error);
    return json({ error: error.message || 'The teaching file could not be uploaded.' }, 400);
  }
};
