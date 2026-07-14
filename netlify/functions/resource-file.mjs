import { getStore } from '@netlify/blobs';
import { isAdmin } from './_shared/admin-auth.mjs';
import { loadTeachingLibrary } from './_shared/teaching-service.mjs';
import { teachingIsLive } from './_shared/teaching-rules.mjs';

export default async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[a-z0-9.-]{8,140}$/i.test(id)) return new Response('Invalid file ID', { status: 400 });
  const store = getStore('izhe-teaching-files');
  const entry = await store.getWithMetadata(id, { type: 'blob', consistency: 'strong' });
  if (!entry?.data) return new Response('File not found', { status: 404 });
  if (!isAdmin(request)) {
    const { library } = await loadTeachingLibrary();
    const expectedUrl = `/.netlify/functions/resource-file?id=${encodeURIComponent(id)}`;
    const resource = library.resources.find((item) => item.url === expectedUrl || item.url.endsWith(`id=${encodeURIComponent(id)}`));
    if (!resource || resource.access !== 'public' || !teachingIsLive(resource)) return new Response('File not found', { status: 404 });
  }
  const contentType = entry.metadata?.contentType || entry.data.type || 'application/octet-stream';
  const inline = contentType.startsWith('image/') || contentType.startsWith('audio/') || contentType.startsWith('video/') || contentType === 'application/pdf';
  const filename = String(entry.metadata?.filename || id).replace(/["\r\n]/g, '');
  return new Response(entry.data, { headers: { 'content-type': contentType, 'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`, 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff' } });
};
