import { getStore } from '@netlify/blobs';

export default async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[a-z0-9.-]{8,120}$/i.test(id)) return new Response('Invalid media ID', { status: 400 });
  const store = getStore('izhe-media');
  const entry = await store.getWithMetadata(id, { type: 'blob', consistency: 'strong' });
  if (!entry?.data) return new Response('Image not found', { status: 404 });
  return new Response(entry.data, {
    headers: {
      'content-type': entry.metadata?.contentType || entry.data.type || 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff'
    }
  });
};
