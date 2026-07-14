import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { loadTeachingLibrary, publicTeaching } from './_shared/teaching-service.mjs';
import { TEACHING_STATUSES, RESOURCE_ACCESS, RESOURCE_TYPES } from './_shared/teaching-rules.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

async function listFiles() {
  const store = getStore('izhe-teaching-files');
  const result = await store.list();
  const files = [];
  for (const blob of result.blobs || []) {
    const metadata = await store.getMetadata(blob.key, { consistency: 'strong' }).catch(() => null);
    if (!metadata?.metadata) continue;
    files.push({ id: blob.key, url: `/.netlify/functions/resource-file?id=${encodeURIComponent(blob.key)}`, ...metadata.metadata });
  }
  return files.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const [{ library, etag }, files] = await Promise.all([loadTeachingLibrary(), listFiles()]);
    return json({ library, etag, preview: publicTeaching(library, { preview: true }), files, options: { statuses: TEACHING_STATUSES, access: RESOURCE_ACCESS, resourceTypes: RESOURCE_TYPES } }, 200, { 'cache-control': 'no-store' });
  } catch (error) {
    console.error('admin-teaching-data', error);
    return json({ error: 'Teaching administration data could not be loaded.' }, 500);
  }
};
