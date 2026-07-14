import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { loadCatalog, publicCatalog } from './_shared/catalog-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

async function listMedia() {
  const store = getStore('izhe-media');
  const result = await store.list();
  const media = [];
  for (const blob of result.blobs || []) {
    const entry = await store.getMetadata(blob.key, { consistency: 'strong' }).catch(() => null);
    if (!entry?.metadata) continue;
    media.push({
      id: blob.key,
      url: `/.netlify/functions/media?id=${encodeURIComponent(blob.key)}`,
      ...entry.metadata
    });
  }
  return media.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const [{ catalog, etag }, media] = await Promise.all([loadCatalog(), listMedia()]);
    return json({ catalog, preview: publicCatalog(catalog, { includeDrafts: true }), etag, media });
  } catch (error) {
    console.error('admin-catalog', error);
    return json({ error: 'Catalog administration data could not be loaded.' }, 500);
  }
};
